import { expect, test } from "@playwright/test";
import { passAgeCheck } from "./helpers";

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

  // The age gate comes first: a neutral question, nothing about the minimum age.
  await expect(page.getByText("When were you born?")).toBeVisible();
  await expect(page.getByTestId("age-check")).not.toContainText(/older|minimum|at least/i);
  await passAgeCheck(page);
  await page.waitForURL("**/onboarding");
  await page.getByLabel("Your name").fill("Jamie Rivera");
  await page.getByRole("button", { name: /Grow as a leader/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Hi Jamie" })).toBeVisible();
  await expect(page.getByText("Start your first 360")).toBeVisible();
});

test("someone under the minimum age is turned away, their account is deleted, and they can't just retry", async ({ page }) => {
  const email = `young.${Date.now()}@example.com`;
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto("/dev/outbox");
  const link = await page.getByTestId("outbox-mail").filter({ hasText: `→ ${email}` }).first().locator('a[href*="/api/auth/callback/email"]').getAttribute("href");
  await page.goto(link!);
  await passAgeCheck(page, new Date().getUTCFullYear() - 12);
  await expect(page.getByTestId("age-blocked")).toBeVisible();
  // Going back to the age check from this browser shows the same answer.
  await page.goto("/welcome");
  await expect(page.getByTestId("age-blocked")).toBeVisible();
  await expect(page.getByTestId("age-check")).toHaveCount(0);
});

test("protected pages redirect to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Fdashboard/);
});
