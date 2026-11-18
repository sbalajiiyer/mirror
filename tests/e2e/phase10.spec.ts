import { devices, expect, test } from "@playwright/test";
import { demoLogin, expectAccessible, passAgeCheck } from "./helpers";

test("sign in with company SSO (pretend identity provider) joins the organization", async ({ page }) => {
  const email = `new.hire.${Date.now()}@brightline.mirror.local`;
  await page.goto("/signin");
  await page.getByTestId("sso-link").click();
  await expect(page.getByRole("heading", { name: "Sign in with company SSO" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  // New accounts pass the age check first, SSO or not.
  await passAgeCheck(page);
  await page.waitForURL("**/onboarding");
});

test("SSO explains when a domain has no SSO", async ({ page }) => {
  await page.goto("/signin/sso");
  await page.getByLabel("Work email").fill("someone@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Single sign-on isn't set up for that email domain")).toBeVisible();
});

test("org admin: residency, retention, SSO settings and the audit log", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs**");
  await page.goto("/orgs");
  await page.getByRole("link", { name: /Brightline Studio/ }).first().click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
  const base = page.url();
  await page.goto(`${base}/settings`);
  await expect(page.getByTestId("domain-verified")).toContainText("brightline.mirror.local");
  await expect(page.getByTestId("sso-redirect")).toContainText("/api/sso/callback");
  await expect(page.getByTestId("org-region")).toHaveText("United States");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Data region").selectOption("eu");
  await page.getByRole("button", { name: "Save data settings" }).click();
  await expect(page.getByTestId("org-region")).toHaveText("European Union");
  await expectAccessible(page);
  await page.getByLabel("Data region").selectOption("us");
  await page.getByRole("button", { name: "Save data settings" }).click();
  await expect(page.getByTestId("org-region")).toHaveText("United States");

  await page.goto(`${base}/audit`);
  await expect(page.getByTestId("audit-table")).toContainText("Changed organization settings");
  await expect(page.getByTestId("audit-table")).toContainText("Verified the SSO domain");
  await expectAccessible(page);
  const csv = await page.request.get(`${base.replace(/^https?:\/\/[^/]+/, "")}`.replace("/orgs/", "/api/orgs/") + "/audit");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Changed organization settings");
});

test("personal activity log and data export", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/settings/activity");
  await expect(page.getByTestId("activity-list")).toContainText("Jordan Lee · Viewed a shared report");
  await expect(page.getByTestId("activity-list")).toContainText("Signed in");
  await expectAccessible(page);
  const res = await page.request.get("/api/me/export");
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.user.email).toBe("demo@mirror.local");
  expect(data.user.assessments.length).toBeGreaterThan(0);
});

// iPhone 13 screen and touch, in Chromium (the only browser installed for the suite).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...iphone } = devices["iPhone 13"];

test.describe("on a phone", () => {
  test.use(iphone);

  test("menu works and main pages don't scroll sideways", async ({ page }) => {
    await demoLogin(page);
    for (const path of ["/dashboard", "/progress", "/questionnaires", "/dashboards", "/chat", "/coaching", "/coaches", "/billing", "/settings", "/settings/activity", "/orgs"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
    await page.goto("/dashboard");
    await page.getByTestId("mobile-menu-button").click();
    await page.locator("#mobile-nav").getByRole("link", { name: "Progress" }).click();
    await page.waitForURL("**/progress");
    await expect(page.locator("#mobile-nav")).toHaveCount(0);
  });

  test("the app can be installed", async ({ page }) => {
    const res = await page.request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m).toMatchObject({ short_name: "Mirror", display: "standalone" });
    expect((await page.request.get(m.icons[0].src)).status()).toBe(200);
  });
});
