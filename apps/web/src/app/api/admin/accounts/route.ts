import { requirePlatformRole } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  addGuardian,
  addHouseholdMember,
  createHousehold,
  createJoinCode,
  createPerson,
  ensureOrganizationMembership,
  ensureUserAccount,
  householdSummary,
  upsertVerifiedEmail,
  upsertVerifiedPhone,
} from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function organizationBySlug(slug: string) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.query(`select id,name,display_name,slug,status from organizations where slug=$1 limit 1`, [slug]);
  if (!result.rows[0]) throw new Error(`Organization '${slug}' was not found`);
  return result.rows[0];
}

export async function GET(request: Request) {
  try { await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform owner access is required" }, { status: 403 }); }
  const url = new URL(request.url);
  const householdId = url.searchParams.get("householdId");
  if (!householdId) return Response.json({ error: "householdId is required" }, { status: 400 });
  try {
    const household = await householdSummary(householdId);
    if (!household) return Response.json({ error: "Household not found" }, { status: 404 });
    return Response.json({ ok: true, household });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load household" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try { await requirePlatformRole(["owner"]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Platform owner access is required" }, { status: 403 }); }
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  try {
    if (action === "create_household") {
      const household = await createHousehold({ name: body.name });
      return Response.json({ ok: true, household });
    }

    if (action === "create_adult") {
      const person = await createPerson({
        displayName: String(body.displayName || ""),
        preferredName: body.preferredName,
        personType: "adult",
        birthYear: body.birthYear ? Number(body.birthYear) : null,
        studentApprovalRequired: false,
      });
      if (body.householdId) {
        await addHouseholdMember({
          householdId: String(body.householdId),
          personId: person.id,
          role: body.manager ? "manager" : "adult",
          canManageHousehold: Boolean(body.manager),
        });
      }
      if (body.email) await upsertVerifiedEmail(person.id, String(body.email));
      if (body.phone) await upsertVerifiedPhone(person.id, String(body.phone));
      const account = await ensureUserAccount(person.id);
      if (body.organizationSlug) {
        const organization = await organizationBySlug(String(body.organizationSlug));
        await ensureOrganizationMembership({ organizationId: organization.id, personId: person.id, role: body.role || "member" });
      }
      return Response.json({ ok: true, person, account });
    }

    if (action === "create_student") {
      const person = await createPerson({
        displayName: String(body.displayName || ""),
        preferredName: body.preferredName,
        personType: "minor",
        birthYear: body.birthYear ? Number(body.birthYear) : null,
        studentApprovalRequired: body.studentApprovalRequired !== false,
      });
      if (body.householdId) {
        await addHouseholdMember({ householdId: String(body.householdId), personId: person.id, role: "student" });
      }
      if (body.organizationSlug) {
        const organization = await organizationBySlug(String(body.organizationSlug));
        await ensureOrganizationMembership({ organizationId: organization.id, personId: person.id, role: body.role || "student" });
      }
      if (body.guardianPersonId) {
        await addGuardian({
          guardianPersonId: String(body.guardianPersonId),
          minorPersonId: person.id,
          relationshipLabel: body.relationshipLabel || "Parent/Guardian",
          canApproveRides: true,
          canManageProfile: true,
        });
      }
      return Response.json({ ok: true, person });
    }

    if (action === "link_guardian") {
      await addGuardian({
        guardianPersonId: String(body.guardianPersonId || ""),
        minorPersonId: String(body.minorPersonId || ""),
        relationshipLabel: body.relationshipLabel,
        canApproveRides: body.canApproveRides !== false,
        canManageProfile: body.canManageProfile !== false,
      });
      return Response.json({ ok: true });
    }

    if (action === "create_join_code") {
      const organization = await organizationBySlug(String(body.organizationSlug || "flomogo"));
      const result = await createJoinCode({
        organizationId: organization.id,
        label: body.label,
        defaultRole: body.defaultRole,
        maxUses: body.maxUses ? Number(body.maxUses) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      });
      return Response.json({ ok: true, organization, ...result });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Account operation failed" }, { status: 500 });
  }
}
