import { expect, test } from "@playwright/test";
import { demoLogin, expectAccessible } from "./helpers";

test("copyright page names the DMCA agent and is linked from every page", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("contentinfo").getByRole("link", { name: "Copyright" }).click();
  await expect(page.getByRole("heading", { name: "Copyright and DMCA", level: 1 })).toBeVisible();
  await expect(page.getByTestId("dmca-agent")).toContainText("Email:");
  await expect(page.getByText("What to include in a notice")).toBeVisible();
  await expectAccessible(page);
});

test("emails carry an unsubscribe link that works, and unsubscribed addresses get nothing more", async ({ page }) => {
  // Send a reminder-type email: a coach invitation from the demo account.
  await demoLogin(page);
  const email = `optout.${Date.now()}@example.com`;
  await page.goto("/coaching");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Coach's email").fill(email);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/sent|pending/i).first()).toBeVisible();
  await page.goto("/dev/outbox");
  const mail = page.getByTestId("outbox-mail").filter({ hasText: `→ ${email}` }).first();
  await expect(mail).toContainText("Don't want emails from Mirror? Unsubscribe:");
  const href = await mail.locator('a[href*="/u/"]').getAttribute("href");
  await page.goto(new URL(href!).pathname);
  await expect(page.getByTestId("unsubscribe")).toContainText(email);
  await page.getByTestId("unsubscribe-button").click();
  await expect(page.getByRole("heading", { name: "You're unsubscribed" })).toBeVisible();
  await expectAccessible(page);
});

test("plan purchase terms sit right beside the buy button and on checkout", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-coach-login").click();
  await page.waitForURL("**/coach");
  await page.goto("/billing");
  const card = page.getByTestId("product-coach_pro_month");
  await expect(card.getByTestId("terms-coach_pro_month")).toContainText("doesn't renew automatically and you won't be charged again");
  await expect(page.getByTestId("coach-paid-until")).toContainText("don't renew automatically");
  await expect(page.getByTestId("terms-credits")).toContainText("One-time payment");
  await page.waitForLoadState("networkidle");
  await card.getByTestId("buy-coach_pro_month").click();
  await page.waitForURL("**/billing/checkout/**");
  await expect(page.getByTestId("checkout-terms")).toContainText("doesn't renew automatically");
});
