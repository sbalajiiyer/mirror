import { expect, test } from "@playwright/test";
import { demoLogin, expectAccessible, passAgeCheck } from "./helpers";

async function coachLogin(page: import("@playwright/test").Page) {
  await page.goto("/signin");
  await page.getByTestId("demo-coach-login").click();
  await page.waitForURL("**/coach");
}

test("coach portfolio, session prep and a shared report without comments", async ({ page }) => {
  await coachLogin(page);
  await expect(page.getByRole("heading", { name: "Your coaching practice" })).toBeVisible();
  await expect(page.getByTestId("client-row")).toHaveCount(6);
  await expect(page.getByTestId("pending-invites")).toContainText("new.client@example.com");
  await expectAccessible(page);

  await page.getByTestId("client-row").filter({ hasText: "Alex Morgan" }).getByRole("link", { name: "Alex Morgan" }).click();
  const prep = page.getByTestId("session-prep");
  await expect(prep).toContainText("Based on S3 · Full 360 · Winter re-run");
  await expect(prep.getByTestId("prep-questions").locator("li").first()).toBeVisible();
  await expect(prep).toContainText("Raise communication");
  await expectAccessible(page);

  await page.getByTestId("ai-brief").click();
  await expect(page.getByTestId("ai-brief-result")).toBeVisible();

  await page.getByLabel("New note (only you can see notes)").fill("Ask about the March panel");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByTestId("coach-note").first()).toContainText("Ask about the March panel");

  await page.getByRole("link", { name: /S3 · Full 360 · Winter re-run/ }).click();
  await expect(page.getByTestId("report")).toBeVisible();
  await expect(page.getByTestId("comments-hidden")).toBeVisible();
  await expect(page.getByRole("link", { name: "Run again" })).toHaveCount(0);
  await expect(page.getByTestId("session-header")).toContainText(/MRR-/);
});

test("cross-client analytics with six sharing clients", async ({ page }) => {
  await coachLogin(page);
  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByTestId("common-blind-spots")).toBeVisible();
  await expect(page.getByTestId("competency-distribution").locator("tbody tr")).toHaveCount(7);
  await expect(page.getByTestId("improvement")).toContainText("clients)");
  await expectAccessible(page);
});

test("the client controls sharing, sees the coach's branding, and can invite a coach", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/coaching");
  const link = page.getByTestId("coach-link").filter({ hasText: "Jordan Lee" });
  await expect(link).toContainText("Lee Leadership Coaching");
  await expect(link.getByLabel(/Reports and progress/)).toBeChecked();
  await expect(link.getByLabel(/Rater comments/)).not.toBeChecked();
  await expect(page.getByText("Winter re-run debrief")).toBeVisible(); // upcoming coaching session
  await expectAccessible(page);

  // Branding shows on Alex's own report.
  await page.goto("/dashboard");
  await page.getByTestId("survey").filter({ hasText: "Pre-promotion 360" }).getByRole("link", { name: /Pre-promotion 360/ }).click();
  await expect(page.getByTestId("report-branding")).toContainText("Lee Leadership Coaching");

  // Switch branding off: it disappears.
  await page.goto("/coaching");
  await link.getByLabel(/Show my coach's branding/).uncheck();
  await link.getByRole("button", { name: "Save sharing" }).click();
  await expect(link.getByRole("status")).toContainText("Saved");
  await page.goto("/dashboard");
  await page.getByTestId("survey").filter({ hasText: "Pre-promotion 360" }).getByRole("link", { name: /Pre-promotion 360/ }).click();
  await expect(page.getByTestId("report")).toBeVisible();
  await expect(page.getByTestId("report-branding")).toHaveCount(0);

  // Invite another coach by email.
  await page.goto("/coaching");
  await page.getByLabel("Coach's email").fill(`second.coach.${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/Invitation sent to/)).toBeVisible();
});

test("a coach invites a new client who accepts from the email link", async ({ page, browser }) => {
  await coachLogin(page);
  const email = `fresh.${Date.now()}@example.com`;
  await page.getByLabel("Client's email").fill(email);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByTestId("pending-invites")).toContainText(email);

  // The invited person signs in with that address (magic link via the dev outbox) and accepts.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto("/dev/outbox");
  const href = await p2.getByTestId("outbox-mail").filter({ hasText: `→ ${email}` }).first().locator('a[href*="/coaching/invite/"]').first().getAttribute("href");
  await p2.goto(new URL(href!).pathname);
  await p2.waitForURL(/\/signin/);
  await p2.getByLabel("Email").fill(email);
  await p2.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(p2.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await p2.goto("/dev/outbox");
  const signIn = await p2
    .getByTestId("outbox-mail")
    .filter({ hasText: `→ ${email}` })
    .filter({ has: p2.locator('a[href*="/api/auth/callback/email"]') })
    .first()
    .locator('a[href*="/api/auth/callback/email"]')
    .getAttribute("href");
  await p2.goto(signIn!);
  await passAgeCheck(p2);
  // Signing in returns to the invitation; a brand-new user accepts, then finishes onboarding.
  await expect(p2.getByTestId("invite-landing")).toContainText("Jordan Lee would like to coach you");
  await p2.getByTestId("accept-invite").click();
  await p2.waitForURL(/\/onboarding/);
  await p2.getByLabel("Your name").fill("Fresh Client");
  await p2.getByRole("button", { name: /Grow as a leader/ }).click();
  await p2.getByRole("button", { name: "Continue" }).click();
  await p2.waitForURL(/dashboard/);
  await p2.goto("/coaching");
  await expect(p2.getByTestId("coach-link")).toContainText("Jordan Lee");
  await ctx.close();

  await page.reload();
  await expect(page.getByTestId("client-row").filter({ hasText: "Fresh Client" })).toBeVisible();
});
