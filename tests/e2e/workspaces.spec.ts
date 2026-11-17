import { expect, test } from "@playwright/test";
import { demoLogin, expectAccessible } from "./helpers";

test("an admin switches between Personal and the company; menus change with the workspace", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs");
  await page.goto("/dashboard");
  const switcher = page.getByTestId("workspace-switcher");
  const nav = page.getByRole("navigation", { name: "Main" });

  await switcher.selectOption({ label: "Personal" });
  await page.waitForURL("**/dashboard");
  await expect(switcher).toHaveValue("personal");
  await expect(nav.getByRole("link", { name: "Billing" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Company" })).toHaveCount(0);

  await switcher.selectOption({ label: "Brightline Studio" });
  await page.waitForURL("**/dashboard");
  await expect(switcher).toHaveValue(/^org:/);
  await expect(nav.getByRole("link", { name: "My rounds" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Company" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Billing" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Questionnaires" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /New 360/ })).toHaveCount(0);
  await expectAccessible(page);

  // The choice is remembered.
  await page.reload();
  await expect(switcher).toHaveValue(/^org:/);
  await nav.getByRole("link", { name: "Company" }).click();
  await expect(page.getByRole("heading", { name: "Brightline Studio" })).toBeVisible();
});

test("opening a company page makes it the active workspace", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs");
  await page.goto("/dashboard");
  await page.getByTestId("workspace-switcher").selectOption({ label: "Personal" });
  await page.waitForURL("**/dashboard");
  await page.goto("/orgs");
  await page.getByTestId("org-row").filter({ hasText: "Brightline Studio" }).click();
  await expect(page.getByTestId("workspace-switcher")).toHaveValue(/^org:/);
});

test("someone with no company sees only Personal, plus a way to companies", async ({ page }) => {
  await demoLogin(page);
  const switcher = page.getByTestId("workspace-switcher");
  await expect(switcher).toHaveValue("personal");
  await switcher.selectOption({ label: "Companies…" });
  await page.waitForURL("**/orgs");
});

test("a company admin can switch off copying reports for people who leave", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs");
  await page.getByTestId("org-row").filter({ hasText: "Brightline Studio" }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
  await page.goto(`${page.url()}/settings`);
  const box = page.getByTestId("allow-personal-copy");
  await expect(box).toBeChecked();
  await box.uncheck();
  await page.getByRole("button", { name: "Save data settings" }).click();
  await expect(page.getByTestId("org-data-form")).toContainText("Saved.");
  await page.reload();
  await expect(page.getByTestId("allow-personal-copy")).not.toBeChecked();
  await page.getByTestId("allow-personal-copy").check();
  await page.getByRole("button", { name: "Save data settings" }).click();
  await expect(page.getByTestId("org-data-form")).toContainText("Saved.");
});

test("owners set company roles and choose AI models; tabs follow the role", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs");
  await page.getByTestId("org-row").filter({ hasText: "Brightline Studio" }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
  const base = page.url();
  const tabs = page.getByRole("navigation", { name: "Organization" });
  await expect(tabs.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("· owner")).toBeVisible();

  await page.goto(`${base}/people`);
  const role = page.getByTestId("member-role").first();
  await expect(role).toBeVisible();
  await expect(role.locator("option")).toHaveText(["Member", "Analyst", "Admin", "Owner"]);

  await page.goto(`${base}/settings`);
  await expect(page.getByTestId("ai-card")).toBeVisible();
  await expectAccessible(page);
});

test("a verified personal email signs in to the same account", async ({ page, context }) => {
  const personal = `personal.${Date.now()}@example.com`;
  await page.goto("/signin");
  await page.getByTestId("demo-login").click();
  await page.waitForURL("**/dashboard");
  const heading = await page.getByRole("heading", { level: 1 }).textContent();

  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Personal email").fill(personal);
  await page.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(page.getByTestId("personal-email")).toContainText("We sent a confirmation link");

  await page.goto("/dev/outbox");
  const confirm = await page.getByTestId("outbox-mail").filter({ hasText: `→ ${personal}` }).first().locator('a[href*="/settings/personal-email/"]').getAttribute("href");
  await page.goto(new URL(confirm!).pathname);
  await page.getByTestId("confirm-personal-email").click();
  await expect(page.getByText(`Confirmed. You can now sign in with ${personal}`)).toBeVisible();

  // Signed out, an email link to the personal address opens the same account.
  await context.clearCookies();
  await page.goto("/signin");
  await page.getByLabel("Email").fill(personal);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto("/dev/outbox");
  const link = await page.getByTestId("outbox-mail").filter({ hasText: `→ ${personal}` }).first().locator('a[href*="/api/auth/callback/email"]').getAttribute("href");
  await page.goto(link!);
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading!);
});

test("a company admin offers coaching and sees its status", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs");
  await page.getByTestId("org-row").filter({ hasText: "Brightline Studio" }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
  await page.getByRole("navigation", { name: "Organization" }).getByRole("link", { name: "Coaching" }).click();
  await page.waitForURL(/\/coaching$/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Coach's email").fill(`coach.${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Offer coaching" }).click();
  await expect(page.getByTestId("offer-coaching")).toContainText("Offered.");
  await expect(page.getByTestId("company-coaching-list")).toContainText("Offered");
  await expectAccessible(page);
});
