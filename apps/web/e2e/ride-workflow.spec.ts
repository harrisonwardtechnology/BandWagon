import crypto from "node:crypto";
import { test, expect, request, type APIRequestContext } from "@playwright/test";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.AUTH_SECRET || process.env.DATA_ENCRYPTION_KEY;
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const runId = `e2e-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

test.skip(!databaseUrl || !authSecret, "DATABASE_URL and AUTH_SECRET are required");

const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false });
const createdPeople: string[] = [];
let organizationId = "";
let parentPersonId = "";
let driverPersonId = "";
let adminToken = "";
let parentToken = "";
let driverToken = "";

function tokenHash(token: string) {
  return crypto.createHmac("sha256", authSecret!).update(`session:${token}`).digest("hex");
}

async function seedPerson(displayName: string, role: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const household = await client.query("insert into households(name,status) values($1,'active') returning id", [`${displayName} Household`]);
    const person = await client.query("insert into people(household_id,display_name,person_type,status) values($1,$2,'adult','active') returning id", [household.rows[0].id, displayName]);
    const account = await client.query("insert into user_accounts(person_id,status,onboarding_completed_at) values($1,'active',now()) returning id", [person.rows[0].id]);
    await client.query("insert into memberships(organization_id,person_id,role,status,membership_source) values($1,$2,$3,'active','e2e')", [organizationId, person.rows[0].id, role]);
    const token = crypto.randomBytes(32).toString("base64url");
    await client.query("insert into auth_sessions(user_account_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')", [account.rows[0].id, tokenHash(token)]);
    await client.query("commit");
    createdPeople.push(person.rows[0].id);
    return { personId: person.rows[0].id as string, token };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function apiFor(token: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL, extraHTTPHeaders: { cookie: `bw_session=${token}` } });
}

test.beforeAll(async () => {
  const org = await pool.query(
    "insert into organizations(name,display_name,slug,status,discoverability,pickup_verification_mode) values($1,$1,$2,'active','unlisted','off') returning id",
    [`BandWagon E2E ${runId}`, runId],
  );
  organizationId = org.rows[0].id;
  const admin = await seedPerson(`Admin ${runId}`, "owner");
  const parent = await seedPerson(`Parent ${runId}`, "member");
  const driver = await seedPerson(`Driver ${runId}`, "member");
  adminToken = admin.token;
  parentToken = parent.token;
  driverToken = driver.token;
  parentPersonId = parent.personId;
  driverPersonId = driver.personId;
  await pool.query("insert into driver_profiles(person_id,default_capacity,status,willing_by_default) values($1,4,'active',true)", [driverPersonId]);
  await pool.query("insert into driver_organization_settings(organization_id,driver_person_id,status,default_capacity,willing_by_default) values($1,$2,'active',4,true)", [organizationId, driverPersonId]);
});

test.afterAll(async () => {
  if (organizationId) await pool.query("delete from organizations where id=$1", [organizationId]);
  if (createdPeople.length) await pool.query("delete from people where id=any($1::uuid[])", [createdPeople]);
  await pool.end();
});

test("organizer creates an event and a ride completes across real roles", async ({ browser }) => {
  const admin = await apiFor(adminToken);
  const parent = await apiFor(parentToken);
  const driver = await apiFor(driverToken);
  try {
    const eventResponse = await admin.post("/api/admin/events", { data: {
      action: "create-manual", organizationId, title: `Practice ${runId}`,
      startsAt: new Date(Date.now() + 86_400_000).toISOString(), rideCoordinationEnabled: true,
    }});
    expect(eventResponse.ok(), await eventResponse.text()).toBeTruthy();
    const event = (await eventResponse.json()).event;

    const forbidden = await parent.post("/api/admin/events", { data: { action: "create-manual", organizationId, title: "Forbidden" } });
    expect(forbidden.status()).toBe(403);

    let response = await parent.post("/api/product", { data: {
      action: "create_request", organizationId, eventId: event.id,
      passengerPersonId: parentPersonId, direction: "to_event", seatsNeeded: 1,
    }});
    expect(response.ok(), await response.text()).toBeTruthy();
    const rideRequest = (await response.json()).result;

    response = await driver.post("/api/product", { data: { action: "offer_ride", rideRequestId: rideRequest.id, seatsOffered: 3 } });
    expect(response.ok(), await response.text()).toBeTruthy();
    const offer = (await response.json()).result;

    response = await parent.post("/api/product", { data: { action: "accept_offer", rideRequestId: rideRequest.id, offerId: offer.id } });
    expect(response.ok(), await response.text()).toBeTruthy();
    const ride = (await response.json()).result;

    for (const toStatus of ["driver_en_route", "arrived", "picked_up", "completed"]) {
      response = await driver.post("/api/product", { data: { action: "transition_ride", rideId: ride.id, toStatus } });
      expect(response.ok(), `${toStatus}: ${await response.text()}`).toBeTruthy();
    }

    const dashboard = await parent.get("/api/product");
    expect(dashboard.ok()).toBeTruthy();
    const body = await dashboard.json();
    expect(body.dashboard.rides.some((item: { id: string; status: string }) => item.id === ride.id && item.status === "completed")).toBeTruthy();

    const context = await browser.newContext();
    await context.addCookies([{ name: "bw_session", value: parentToken, url: baseURL }]);
    const page = await context.newPage();
    await page.goto("/app/rides");
    await expect(page.getByText(`Practice ${runId}`).first()).toBeVisible();
    await expect(page.getByText("completed", { exact: false }).first()).toBeVisible();
    await context.close();
  } finally {
    await Promise.all([admin.dispose(), parent.dispose(), driver.dispose()]);
  }
});
