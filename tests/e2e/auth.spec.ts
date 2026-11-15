import { expect, test } from "@playwright/test";

test("magic-link sign-in leads a new user to onboarding, then the dashboard", async ({ page }) => {
  const email = `new.${Date.now()}@example.com`;
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto("/dev/outbox");
  const mail = page.getByTestId("outbox-mail").filter({ hasText: `→ ${email}` }).first();
  const link = await mail.locator('a[href*="/api/auth/callback/email"]').getAttribute("href");
  await page.goto(link!);

  await page.waitForURL("**/onboarding");
  await page.getByLabel("Your name").fill("Jamie Rivera");
  await page.getByRole("button", { name: /Grow as a leader/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Hi Jamie" })).toBeVisible();
  await expect(page.getByText("Start your first 360")).toBeVisible();
});

test("protected pages redirect to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fdashboard/);
});
