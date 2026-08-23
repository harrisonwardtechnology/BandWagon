import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { decryptSensitive, encryptSensitive, lookupHash, randomPublicRef } from "@/lib/data-security";

export type HouseholdRole = "manager" | "adult" | "student" | "dependent";

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email address");
  return email;
}

export function normalizePhone(value: string) {
  const phone = value.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Phone must use E.164 format");
  return phone;
}

export async function createHousehold(input: { name?: string | null }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const publicRef = randomPublicRef("hh");
  const result = await db.query(
    `insert into households (name,public_ref,status,created_at,updated_at)
     values ($1,$2,'active',now(),now()) returning *`,
    [input.name?.trim() || null, publicRef]
  );
  return result.rows[0];
}

export async function createPerson(input: {
  displayName: string;
  personType: "adult" | "minor";
  preferredName?: string | null;
  birthYear?: number | null;
  studentApprovalRequired?: boolean;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("Display name is required");
  if (input.birthYear && (input.birthYear < 1900 || input.birthYear > new Date().getFullYear())) {
    throw new Error("Invalid birth year");
  }
  const result = await db.query(
    `insert into people
      (display_name,preferred_name,person_type,birth_year,student_approval_required,status,created_at,updated_at)
     values ($1,$2,$3,$4,$5,'active',now(),now()) returning *`,
    [
      displayName,
      input.preferredName?.trim() || null,
      input.personType,
      input.birthYear || null,
      input.studentApprovalRequired ?? true,
    ]
  );
  return result.rows[0];
}

export async function addHouseholdMember(input: {
  householdId: string;
  personId: string;
  role: HouseholdRole;
  canManageHousehold?: boolean;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  await db.query(
    `insert into household_members (household_id,person_id,household_role,can_manage_household)
     values ($1,$2,$3,$4)
     on conflict (household_id,person_id) do update set
       household_role=excluded.household_role,
       can_manage_household=excluded.can_manage_household`,
    [input.householdId, input.personId, input.role, input.canManageHousehold ?? input.role === "manager"]
  );
  await db.query(`update people set household_id=$1,updated_at=now() where id=$2`, [input.householdId, input.personId]);
}

export async function addGuardian(input: {
  guardianPersonId: string;
  minorPersonId: string;
  relationshipLabel?: string | null;
  canApproveRides?: boolean;
  canManageProfile?: boolean;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  await db.query(
    `insert into guardian_relationships
      (guardian_person_id,minor_person_id,relationship_label,can_approve_rides,can_manage_profile)
     values ($1,$2,$3,$4,$5)
     on conflict (guardian_person_id,minor_person_id) do update set
       relationship_label=excluded.relationship_label,
       can_approve_rides=excluded.can_approve_rides,
       can_manage_profile=excluded.can_manage_profile`,
    [
      input.guardianPersonId,
      input.minorPersonId,
      input.relationshipLabel?.trim() || null,
      input.canApproveRides ?? true,
      input.canManageProfile ?? true,
    ]
  );
}

export async function upsertVerifiedEmail(personId: string, emailValue: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const email = normalizeEmail(emailValue);
  const result = await db.query(
    `insert into emails (person_id,normalized_email,verified_at,visibility)
     values ($1,$2,now(),'hidden')
     on conflict (normalized_email) do update set person_id=excluded.person_id,verified_at=now()
     returning *`,
    [personId, email]
  );
  return result.rows[0];
}

export async function upsertVerifiedPhone(personId: string, phoneValue: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const phone = normalizePhone(phoneValue);
  const hash = lookupHash(phone);
  const ciphertext = encryptSensitive(phone);
  const result = await db.query(
    `insert into phones
      (person_id,e164_ciphertext,lookup_hash,verified_at,visibility,messaging_consent_status)
     values ($1,$2,$3,now(),'hidden','opted_in')
     on conflict (lookup_hash) do update set
       person_id=excluded.person_id,
       e164_ciphertext=excluded.e164_ciphertext,
       verified_at=now(),
       messaging_consent_status='opted_in'
     returning id,person_id,lookup_hash,verified_at,messaging_consent_status`,
    [personId, ciphertext, hash]
  );
  return result.rows[0];
}

export async function getVerifiedPhone(personId: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.query(
    `select e164_ciphertext from phones
     where person_id=$1 and verified_at is not null and messaging_consent_status <> 'opted_out'
     order by verified_at desc limit 1`,
    [personId]
  );
  return result.rows[0]?.e164_ciphertext ? decryptSensitive(result.rows[0].e164_ciphertext) : null;
}

export async function ensureUserAccount(personId: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.query(
    `insert into user_accounts (person_id,status,created_at)
     values ($1,'active',now())
     on conflict (person_id) do update set status='active'
     returning *`,
    [personId]
  );
  return result.rows[0];
}

export async function ensureOrganizationMembership(input: {
  organizationId: string;
  personId: string;
  role?: string;
  status?: string;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const existing = await db.query(
    `select id from memberships where organization_id=$1 and person_id=$2 and group_id is null limit 1`,
    [input.organizationId, input.personId]
  );
  if (existing.rows[0]) {
    const updated = await db.query(
      `update memberships set role=$1,status=$2 where id=$3 returning *`,
      [input.role || "member", input.status || "active", existing.rows[0].id]
    );
    return updated.rows[0];
  }
  const result = await db.query(
    `insert into memberships (organization_id,person_id,role,status)
     values ($1,$2,$3,$4) returning *`,
    [input.organizationId, input.personId, input.role || "member", input.status || "active"]
  );
  return result.rows[0];
}

export async function createJoinCode(input: {
  organizationId: string;
  label?: string | null;
  defaultRole?: string;
  maxUses?: number | null;
  expiresAt?: Date | null;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const code = crypto.randomBytes(5).toString("base64url").replace(/[-_]/g, "").toUpperCase().slice(0, 8);
  const codeHash = lookupHash(code);
  await db.query(
    `insert into organization_join_codes
      (organization_id,code_hash,label,default_role,max_uses,expires_at,status)
     values ($1,$2,$3,$4,$5,$6,'active')`,
    [input.organizationId, codeHash, input.label?.trim() || null, input.defaultRole || "member", input.maxUses || null, input.expiresAt || null]
  );
  return { code };
}

export async function householdSummary(householdId: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const household = await db.query(`select * from households where id=$1`, [householdId]);
  if (!household.rows[0]) return null;
  const members = await db.query(
    `select p.id,p.display_name,p.preferred_name,p.person_type,p.birth_year,p.student_approval_required,
            hm.household_role,hm.can_manage_household
     from household_members hm join people p on p.id=hm.person_id
     where hm.household_id=$1 order by hm.created_at`,
    [householdId]
  );
  const guardians = await db.query(
    `select gr.guardian_person_id,gr.minor_person_id,gr.relationship_label,
            gr.can_approve_rides,gr.can_manage_profile
     from guardian_relationships gr
     where gr.guardian_person_id=any($1::uuid[]) or gr.minor_person_id=any($1::uuid[])`,
    [members.rows.map((row) => row.id)]
  );
  return { ...household.rows[0], members: members.rows, guardians: guardians.rows };
}
