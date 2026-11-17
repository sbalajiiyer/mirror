import { expect, test } from "@playwright/test";
import { demoLogin, expectAccessible } from "./helpers";

test("buy AI credits through the test checkout", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/billing");
  await expect(page.getByTestId("test-mode")).toBeVisible();
  await expect(page.getByTestId("plan-badge")).toHaveText("Pro");
  const before = Number(await page.getByTestId("ai-credits").textContent());
  await page.waitForLoadState("networkidle");
  await page.getByTestId("buy-ai_credits_5").click();
  await page.waitForURL("**/billing/checkout/**");
  await expect(page.getByTestId("checkout-amount")).toHaveText("$19.99");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await page.waitForURL("**/billing?paid=**");
  await expect(page.getByText("5 AI credits is now on your account")).toBeVisible();
  await expect(page.getByTestId("ai-credits")).toHaveText(String(before + 5));
  await expect(page.getByTestId("payments")).toContainText("paid");
  await expectAccessible(page);
});

test("find a coach in the marketplace and request an intro", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/coaches");
  await expect(page.getByTestId("coach-card")).toHaveCount(2);
  await page.getByLabel("Search").fill("first-time");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByTestId("coach-card")).toHaveCount(1);
  await expectAccessible(page);
  await page.getByRole("link", { name: "Priya Shah" }).click();
  await expect(page.getByRole("heading", { name: /Priya Shah/ })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByTestId("request-intro").click();
  // The success note, or the refreshed page showing the pending invitation.
  await expect(page.getByText(/Request sent|pending invitation with Priya Shah/)).toBeVisible();
  await page.goto("/coaching");
  await expect(page.getByText("priya@coaches.mirror.local")).toBeVisible();
});

test("coach sees plan, marketplace listing and can gift a full 360", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-coach-login").click();
  await page.waitForURL("**/coach");
  await page.goto("/coach/settings");
  await expect(page.getByTestId("coach-plan")).toContainText("Coach Starter");
  await expect(page.getByTestId("listing-form").getByLabel("Headline")).toHaveValue(/Executive coach/);
  await page.goto("/coach");
  await page.getByRole("link", { name: "Alex Morgan" }).first().click();
  await page.waitForLoadState("networkidle");
  await page.getByTestId("gift-full-360").click();
  await expect(page.getByText("Gifted.")).toBeVisible();
  await page.goto("/billing");
  await expect(page.getByTestId("coach-billing")).toContainText("Coach Starter");
  await expect(page.getByTestId("report-credits")).toHaveText("2");
});

test("company owner sees the plan and seats, and can add seats", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs**");
  // Company billing lives in the company workspace (Phase 11e).
  await page.goto("/billing");
  await page.getByTestId("org-billing").getByRole("link", { name: /Brightline Studio billing/ }).click();
  await page.waitForURL(/\/orgs\/[^/]+\/billing$/);
  await expect(page.getByTestId("company-plan-status")).toContainText("Paid until");
  await expect(page.getByTestId("org-seats")).toHaveText("100");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("org-billing").getByTestId("buy-org_seats_25").click();
  await page.waitForURL("**/billing/checkout/**");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await page.waitForURL(/\/orgs\/[^/]+\/billing\?paid=/);
  await expect(page.getByTestId("org-seats")).toHaveText("125");
});
