#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

const jobs = [
  ["ride-reminders", "RIDE_REMINDER_CRON_SECRET"],
  ["platform-budget", "PLATFORM_BUDGET_CRON_SECRET"],
  ["safety-maintenance", "SAFETY_CRON_SECRET"],
  ["privacy-maintenance", "PRIVACY_MAINTENANCE_CRON_SECRET"],
];

async function body(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

for (const [path, secretName] of jobs) {
  const secret = process.env[secretName];
  if (!secret) throw new Error(`${secretName} is required for production smoke`);
  const response = await fetch(`${baseUrl}/api/cron/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  const result = await body(response);
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(result)}`);
  console.log(`PASS cron ${path}: ${response.status}`);
}

const deepResponse = await fetch(`${baseUrl}/api/health/deep`);
const deep = await body(deepResponse);
if (!deep || typeof deep !== "object" || !Array.isArray(deep.integrations)) {
  throw new Error(`Deep health returned an invalid response: ${JSON.stringify(deep)}`);
}
for (const key of ["database", "push"]) {
  const integration = deep.integrations.find((item) => item.key === key);
  if (integration?.status !== "healthy") {
    throw new Error(`${key} health is ${integration?.status || "missing"}: ${integration?.detail || "no detail"}`);
  }
  console.log(`PASS integration ${key}: healthy`);
}

console.log("PASS production cron and health smoke");
