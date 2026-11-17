import { expect, test, type Page } from "@playwright/test";
import { demoLogin, expectAccessible, passAgeCheck } from "./helpers";

async function signUp(page: Page, email: string) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto("/dev/outbox");
  const link = await page.getByTestId("outbox-mail").filter({ hasText: `→ ${email}` }).first().locator('a[href*="/api/auth/callback/email"]').getAttribute("href");
  await page.goto(link!);
}

test("privacy policy and terms are public, linked, and accessible", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("link", { name: "Privacy policy" })).toBeVisible();
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy policy", level: 1 })).toBeVisible();
  await expect(page.getByTestId("legal-draft")).toBeVisible();
  await expect(page.getByText("How raters stay anonymous")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("contentinfo").getByRole("link", { name: "Terms" }).click();
  await expect(page.getByRole("heading", { name: "Terms of service", level: 1 })).toBeVisible();
  await expectAccessible(page);
});

test("deleting an account waits 7 days, and signing in again cancels it", async ({ page }) => {
  const email = `grace.${Date.now()}@example.com`;
  await signUp(page, email);
  await passAgeCheck(page);
  await page.waitForURL("**/onboarding");
  await page.getByLabel("Your name").fill("Grace Period");
  await page.getByRole("button", { name: /Grow as a leader/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/dashboard");

  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("danger-zone")).toBeVisible();
  await expectAccessible(page);
  const zone = page.getByTestId("danger-account");
  await zone.getByRole("button", { name: "Delete my account" }).click();
  const confirm = zone.getByRole("button", { name: "Delete my account" });
  await expect(confirm).toBeDisabled();
  await zone.getByLabel(/To confirm, type your email/).fill("someone-else@example.com");
  await expect(confirm).toBeDisabled();
  await zone.getByLabel(/To confirm, type your email/).fill(email.toUpperCase());
  await confirm.click();
  await page.waitForURL(/\/signin\?deleted=1/);
  await expect(page.getByTestId("deletion-scheduled")).toContainText("7 days");

  await signUp(page, email);
  await page.waitForURL("**/dashboard");
  await expect(page.getByTestId("deletion-cancelled")).toBeVisible();
});

test("delete all AI conversations from the danger zone", async ({ page }) => {
  await signUp(page, `chats.${Date.now()}@example.com`);
  await passAgeCheck(page);
  await page.waitForURL("**/onboarding");
  await page.getByLabel("Your name").fill("Chat Deleter");
  await page.getByRole("button", { name: /Grow as a leader/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/chat");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("new-report-chat").getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/chat\/[^/?]+$/);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  const zone = page.getByTestId("danger-chats");
  await expect(zone).toContainText("1 conversation.");
  await zone.getByRole("button", { name: "Delete conversations" }).click();
  await zone.getByLabel(/To confirm, type/).fill("delete");
  await zone.getByRole("button", { name: "Delete conversations" }).click();
  await expect(zone).toContainText("Deleted 1 conversation(s).");
  await expect(zone).toContainText("0 conversations.");
});

test("delete one session of a survey with its survey ID", async ({ page }) => {
  await demoLogin(page);
  const survey = page.getByTestId("survey").filter({ hasText: "Pre-promotion 360" });
  const before = await survey.getByTestId("session-row").count();
  if (await survey.getByRole("link", { name: "Run again" }).isVisible()) {
    await survey.getByRole("link", { name: "Run again" }).click();
    await page.getByLabel("Session name").fill("To delete");
    await page.getByTestId("rerun").click();
    await page.waitForURL(/\/self$/);
    await page.goto("/dashboard");
  }
  const count = await survey.getByTestId("session-row").count();
  const code = (await survey.getByTitle("Survey ID").textContent())!.trim();
  // The newest (draft) session is listed first.
  await survey.getByTestId("session-row").first().click();
  await page.waitForLoadState("networkidle");
  const zone = page.getByTestId("danger-survey");
  await expect(zone).toContainText(/Delete session \d+/);
  await zone.getByRole("button", { name: "Delete session" }).click();
  await zone.getByLabel(/type the survey ID/).fill(code.toLowerCase());
  await zone.getByRole("button", { name: "Delete session" }).click();
  await page.waitForURL(/\/dashboard\?deleted=1/);
  await expect(page.getByText("Deleted. Its responses, reports and links are gone.")).toBeVisible();
  await expect(survey.getByTestId("session-row")).toHaveCount(count - 1);
  expect(count - 1).toBeGreaterThanOrEqual(Math.min(before, 3));
});

test("health check reports the app and database", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j).toMatchObject({ ok: true, checks: { database: { ok: true } } });
  const pdf = await (await request.get("/api/health?check=pdf")).json();
  expect(pdf.checks.pdf.ok).toBe(true);
  expect(pdf.checks.pdf.bytes).toBeGreaterThan(500);
});
