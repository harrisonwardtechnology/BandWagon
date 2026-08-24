import { getDb } from "@/lib/db";
import { lookupHash } from "@/lib/data-security";
import { upsertDriverProfile } from "@/lib/drivers";

function dbRequired() {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

function assertScope(scopeOrganizationId: string | null | undefined, organizationId: string) {
  if (scopeOrganizationId && scopeOrganizationId !== organizationId) {
    throw new Error("This organization is not available on the current BandWagon tenant");
  }
}

async function managedHousehold(personId: string) {
  const db = dbRequired();
  const result = await db.query(
    `select h.* from household_members hm join households h on h.id=hm.household_id
     where hm.person_id=$1 and hm.can_manage_household=true and h.status='active' limit 1`,
    [personId]
  );
  if (!result.rowCount) throw new Error("You do not manage an active household");
  return result.rows[0];
}

export async function getOnboardingContext(personId: string, organizationScopeId?: string | null) {
  const db = dbRequired();
  const household = await db.query(
    `select h.*,hm.household_role,hm.can_manage_household
     from household_members hm join households h on h.id=hm.household_id
     where hm.person_id=$1 and h.status='active' limit 1`,
    [personId]
  );
  const householdId = household.rows[0]?.id || null;
  const members = householdId ? await db.query(
    `select p.id,p.display_name,p.preferred_name,p.person_type,p.birth_year,p.student_approval_required,
            hm.household_role,hm.can_manage_household,
            coalesce(gr.require_verified_pickup,false) as require_verified_pickup,
            case when p.person_type<>'minor' then 'not_applicable'
                 when exists(select 1 from guardian_consents gc
                              where gc.guardian_person_id=$2 and gc.minor_person_id=p.id
                                and gc.consent_type='platform_minor_use' and gc.status='active') then 'active'
                 else 'not_granted' end as guardian_consent_status
     from household_members hm join people p on p.id=hm.person_id
     left join guardian_relationships gr on gr.guardian_person_id=$2 and gr.minor_person_id=p.id
     where hm.household_id=$1 and p.status='active' order by hm.created_at`,
    [householdId,personId]
  ) : { rows: [] };
  const organizations = await db.query(
    `select o.id,coalesce(o.display_name,o.name) as name,o.slug,m.role,m.status
     from memberships m join organizations o on o.id=m.organization_id
     where m.person_id=$1 and m.group_id is null and m.status='active' and o.status='active'
       and ($2::uuid is null or o.id=$2::uuid)
     order by name`,
    [personId,organizationScopeId || null]
  );
  const driverProfiles = await db.query(
    `select dos.*,dp.vehicle_label,dp.vehicle_make,dp.vehicle_model,dp.vehicle_color,
            dp.license_plate_hint,dp.notes,o.id as organization_id,
            coalesce(o.display_name,o.name) as organization_name
     from driver_organization_settings dos
     join driver_profiles dp on dp.person_id=dos.driver_person_id
     join organizations o on o.id=dos.organization_id and o.status='active'
     join memberships m on m.person_id=dos.driver_person_id and m.organization_id=dos.organization_id
       and m.group_id is null and m.status='active'
     where dos.driver_person_id=$1 and ($2::uuid is null or dos.organization_id=$2::uuid)
     order by organization_name`,
    [personId,organizationScopeId || null]
  );
  return {
    household: household.rows[0] || null,
    members: members.rows,
    organizations: organizations.rows,
    driverProfiles: driverProfiles.rows,
  };
}

export async function addStudentToHousehold(input: {
  managerPersonId: string;
  displayName: string;
  preferredName?: string | null;
  birthYear?: number | null;
  relationshipLabel?: string | null;
  studentApprovalRequired?: boolean;
}) {
  const db = dbRequired();
  const household = await managedHousehold(input.managerPersonId);
  const name = input.displayName.trim();
  if (!name) throw new Error("Student name is required");
  const birthYear = input.birthYear == null ? null : Number(input.birthYear);
  if (birthYear && (birthYear < 1900 || birthYear > new Date().getFullYear())) throw new Error("Invalid birth year");

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const person = await client.query(
      `insert into people
        (household_id,display_name,preferred_name,person_type,birth_year,student_approval_required,status,created_at,updated_at)
       values ($1,$2,$3,'minor',$4,$5,'active',now(),now()) returning *`,
      [household.id,name,input.preferredName?.trim() || null,birthYear,input.studentApprovalRequired !== false]
    );
    const studentId = person.rows[0].id;
    await client.query(
      `insert into household_members (household_id,person_id,household_role,can_manage_household)
       values ($1,$2,'student',false)`,
      [household.id,studentId]
    );
    await client.query(
      `insert into guardian_relationships
        (guardian_person_id,minor_person_id,relationship_label,can_approve_rides,can_manage_profile)
       values ($1,$2,$3,true,true)`,
      [input.managerPersonId,studentId,input.relationshipLabel?.trim() || "Parent / Guardian"]
    );
    await client.query(
      `insert into guardian_consents
        (minor_person_id,guardian_person_id,consent_type,status,metadata)
       values($1,$2,'platform_minor_use','active',$3::jsonb)`,
      [studentId,input.managerPersonId,JSON.stringify({ source:"household_student_created" })]
    );
    // Organization membership is intentionally NOT inherited from the parent.
    // A household manager explicitly chooses each organization for each student.
    await client.query("COMMIT");
    return person.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function updateManagedStudentSettings(input: {
  managerPersonId: string;
  studentPersonId: string;
  studentApprovalRequired: boolean;
  requireVerifiedPickup: boolean;
  guardianConsentGranted: boolean;
}) {
  const db = dbRequired();
  const client = await db.connect();
  try {
    await client.query("begin");
    const authorized = await client.query(
      `select p.household_id
         from people p
        where p.id=$1 and p.person_type='minor' and p.status='active'
          and (
            exists(select 1 from guardian_relationships gr
                    where gr.guardian_person_id=$2 and gr.minor_person_id=p.id and gr.can_manage_profile=true)
            or exists(select 1 from household_members manager
                       where manager.household_id=p.household_id and manager.person_id=$2
                         and manager.can_manage_household=true)
          )
        for update`,
      [input.studentPersonId,input.managerPersonId]
    );
    if (!authorized.rowCount) throw new Error("You cannot manage this student profile");
    await client.query(
      `update people set student_approval_required=$2,updated_at=now() where id=$1`,
      [input.studentPersonId,input.studentApprovalRequired]
    );
    await client.query(
      `insert into guardian_relationships
        (guardian_person_id,minor_person_id,relationship_label,can_approve_rides,can_manage_profile,require_verified_pickup)
       values($1,$2,'Parent / Guardian',true,true,$3)
       on conflict(guardian_person_id,minor_person_id) do update set
         can_approve_rides=true,can_manage_profile=true,require_verified_pickup=excluded.require_verified_pickup`,
      [input.managerPersonId,input.studentPersonId,input.requireVerifiedPickup]
    );
    if (input.guardianConsentGranted) {
      const renewed = await client.query(
        `update guardian_consents
            set metadata=metadata||$3::jsonb
          where minor_person_id=$1 and guardian_person_id=$2
            and consent_type='platform_minor_use' and status='active'
          returning id`,
        [input.studentPersonId,input.managerPersonId,JSON.stringify({ source:"household_settings",renewedAt:new Date().toISOString() })]
      );
      if (!renewed.rowCount) {
        await client.query(
          `insert into guardian_consents
            (minor_person_id,guardian_person_id,consent_type,status,metadata)
           values($1,$2,'platform_minor_use','active',$3::jsonb)`,
          [input.studentPersonId,input.managerPersonId,JSON.stringify({ source:"household_settings",renewedAt:new Date().toISOString() })]
        );
      }
    } else {
      await client.query(
        `update guardian_consents set status='revoked',revoked_at=now()
          where minor_person_id=$1 and guardian_person_id=$2
            and consent_type='platform_minor_use' and status='active'`,
        [input.studentPersonId,input.managerPersonId]
      );
    }
    await client.query(
      `insert into audit_events(actor_person_id,action,target_type,target_id,metadata)
       values($1,'guardian.student_settings_updated','person',$2,$3::jsonb)`,
      [input.managerPersonId,input.studentPersonId,JSON.stringify({
        studentApprovalRequired:input.studentApprovalRequired,
        requireVerifiedPickup:input.requireVerifiedPickup,
        guardianConsentGranted:input.guardianConsentGranted,
      })]
    );
    await client.query("commit");
    return { studentPersonId:input.studentPersonId,updated:true };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function joinOrganizationWithCode(input: { personId: string; code: string; organizationScopeId?: string | null }) {
  const db = dbRequired();
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error("Join code is required");
  const hash = lookupHash(code);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const codeResult = await client.query(
      `select c.*,o.status as organization_status,coalesce(o.display_name,o.name) as organization_name
       from organization_join_codes c join organizations o on o.id=c.organization_id
       where c.code_hash=$1 for update`,
      [hash]
    );
    if (!codeResult.rowCount) throw new Error("Join code was not recognized");
    const joinCode = codeResult.rows[0];
    assertScope(input.organizationScopeId,joinCode.organization_id);
    if (joinCode.status !== 'active' || joinCode.organization_status !== 'active') throw new Error("Join code is not active");
    if (joinCode.expires_at && new Date(joinCode.expires_at).getTime() < Date.now()) throw new Error("Join code has expired");
    if (joinCode.max_uses != null && Number(joinCode.use_count) >= Number(joinCode.max_uses)) throw new Error("Join code has reached its use limit");

    const existing = await client.query(
      `select * from memberships where organization_id=$1 and person_id=$2 and group_id is null limit 1 for update`,
      [joinCode.organization_id,input.personId]
    );
    let membership;
    let outcome: 'joined' | 'already_member' = 'joined';
    if (existing.rowCount && existing.rows[0].status === 'active') {
      membership = existing.rows[0];
      outcome = 'already_member';
    } else if (existing.rowCount) {
      membership = (await client.query(
        `update memberships set status='active',role=$1,joined_via_code_id=$2,
           membership_source='join_code',updated_at=now() where id=$3 returning *`,
        [joinCode.default_role || 'member',joinCode.id,existing.rows[0].id]
      )).rows[0];
    } else {
      membership = (await client.query(
        `insert into memberships
          (organization_id,person_id,role,status,joined_via_code_id,membership_source,updated_at)
         values ($1,$2,$3,'active',$4,'join_code',now()) returning *`,
        [joinCode.organization_id,input.personId,joinCode.default_role || 'member',joinCode.id]
      )).rows[0];
    }
    if (outcome === 'joined') {
      await client.query(`update organization_join_codes set use_count=use_count+1,updated_at=now() where id=$1`, [joinCode.id]);
    }
    await client.query(
      `insert into organization_join_events (organization_id,person_id,join_code_id,outcome,metadata)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [joinCode.organization_id,input.personId,joinCode.id,outcome,JSON.stringify({ label:joinCode.label || null })]
    );
    await client.query("COMMIT");
    return { membership, organizationId:joinCode.organization_id, organizationName:joinCode.organization_name, outcome };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function copyOrganizationMembershipToStudent(input: {
  managerPersonId: string;
  studentPersonId: string;
  organizationId: string;
  organizationScopeId?: string | null;
}) {
  const db = dbRequired();
  assertScope(input.organizationScopeId,input.organizationId);
  const household = await managedHousehold(input.managerPersonId);
  const student = await db.query(
    `select 1 from household_members where household_id=$1 and person_id=$2 and household_role='student'`,
    [household.id,input.studentPersonId]
  );
  if (!student.rowCount) throw new Error("Student is not in your household");
  const parentMembership = await db.query(
    `select 1 from memberships where organization_id=$1 and person_id=$2 and group_id is null and status='active'`,
    [input.organizationId,input.managerPersonId]
  );
  if (!parentMembership.rowCount) throw new Error("You are not a member of that organization");
  const existing = await db.query(
    `select id from memberships where organization_id=$1 and person_id=$2 and group_id is null limit 1`,
    [input.organizationId,input.studentPersonId]
  );
  if (existing.rowCount) {
    return (await db.query(
      `update memberships set status='active',membership_source='guardian_added',updated_at=now()
       where id=$1 returning *`, [existing.rows[0].id]
    )).rows[0];
  }
  return (await db.query(
    `insert into memberships (organization_id,person_id,role,status,membership_source,updated_at)
     values ($1,$2,'member','active','guardian_added',now()) returning *`,
    [input.organizationId,input.studentPersonId]
  )).rows[0];
}

export async function configureSelfAsDriver(input: {
  personId: string;
  organizationId: string;
  organizationScopeId?: string | null;
  enabled: boolean;
  capacity?: number;
  vehicleLabel?: string | null;
  vehicleColor?: string | null;
  willingByDefault?: boolean;
}) {
  assertScope(input.organizationScopeId,input.organizationId);
  return upsertDriverProfile({
    organizationId: input.organizationId,
    personId: input.personId,
    status: input.enabled ? 'active' : 'paused',
    defaultCapacity: input.capacity || 4,
    willingByDefault: input.enabled && input.willingByDefault !== false,
    allowMultiPassenger: true,
    vehicleLabel: input.vehicleLabel || null,
    vehicleColor: input.vehicleColor || null,
  });
}
