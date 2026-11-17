import { expect, test } from "@playwright/test";

// A session cookie can outlive its user (account deleted, demo data re-seeded on deploy).
// It must count as signed out, not bounce between /signin and the app forever.
test("a session for a user that no longer exists goes to sign-in, without a redirect loop", async ({ browser }) => {
  const email = `stale.${Date.now()}@example.com`;
  const a = await browser.newContext();
  const page = await a.newPage();
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto("/dev/outbox");
  const link = await page.getByTestId("outbox-mail").filter({ hasText: `→ ${email}` }).first().locator('a[href*="/api/auth/callback/email"]').getAttribute("href");
  await page.goto(link!);
  await page.waitForURL("**/onboarding");
  await page.getByLabel("Your name").fill("Stale Tester");
  await page.getByRole("button", { name: /Grow as a leader/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/dashboard");

  // Keep a copy of the session, then delete the account.
  const b = await browser.newContext({ storageState: await a.storageState() });
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  page.once("dialog", (d) => d.accept());
  await page.getByLabel(/Type .* to confirm/).fill(email);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/settings"));

  const old = await b.newPage();
  for (const path of ["/dashboard", "/settings", "/onboarding"]) {
    await old.goto(path);
    await expect(old).toHaveURL(/\/signin/);
  }
  await expect(old.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  await a.close();
  await b.close();
});
