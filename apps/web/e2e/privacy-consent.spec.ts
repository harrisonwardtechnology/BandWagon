import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("privacy banner makes rejection as easy as acceptance and persists the choice", async ({ page, context }) => {
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: /BandWagon uses only essential technology/i });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Accept optional" })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Reject optional" })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Manage preferences" })).toBeVisible();

  await banner.getByRole("button", { name: "Reject optional" }).click();
  await expect(banner).toBeHidden();
  const cookie = (await context.cookies()).find(item => item.name === "bw_privacy_preferences");
  expect(decodeURIComponent(cookie?.value || "")).toContain("f=0");

  await page.getByRole("button", { name: "Cookie preferences" }).click();
  const preferences = page.getByRole("dialog", { name: "Choose what BandWagon may store" });
  await expect(preferences).toBeVisible();
  await expect(preferences.getByText("Advertising", { exact: true })).toBeVisible();
  await expect(preferences.getByText("Not used. BandWagon does not deploy advertising pixels or cross-site tracking.")).toBeVisible();
});

test("functional storage requires an affirmative saved choice", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Manage preferences" }).click();
  const preferences = page.getByRole("dialog", { name: "Choose what BandWagon may store" });
  await preferences.getByRole("checkbox", { name: "Allow optional functional storage" }).check();
  await preferences.getByRole("button", { name: "Save my choices" }).click();
  const cookie = (await context.cookies()).find(item => item.name === "bw_privacy_preferences");
  expect(decodeURIComponent(cookie?.value || "")).toContain("f=1");
});

test("cookie policy remains available without accepting optional storage", async ({ page }) => {
  await page.goto("/cookies");
  await expect(page.getByRole("heading", { name: "Cookie and Similar Technologies Policy" })).toBeVisible();
  await expect(page.getByText("bw_session", { exact: true })).toBeVisible();
  await expect(page.getByText("bw_support", { exact: true })).toBeVisible();
  await expect(page.getByText("bw_privacy_preferences", { exact: true })).toBeVisible();
});
