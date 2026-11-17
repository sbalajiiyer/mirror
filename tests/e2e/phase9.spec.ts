import { expect, test } from "@playwright/test";
import { demoLogin, expectAccessible } from "./helpers";

test("buy any number of credits; the buyer sees and pays the fees", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/billing");
  await expect(page.getByTestId("test-mode")).toBeVisible();
  await expect(page.getByTestId("price-list")).toContainText("49 credits");
  const before = Number((await page.getByTestId("credit-balance").innerText()).replace(/,/g, ""));
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Credits to buy").fill("37");
  // 37 credits + 2.9% + 30¢, grossed up = $38.42.
  await expect(page.getByTestId("credit-price")).toHaveText("37 credits $37.00 + card and processing fees $1.42 = $38.42");
  await page.getByTestId("buy-credits-button").click();
  await page.waitForURL("**/billing/checkout/**");
  await expect(page.getByTestId("checkout-amount")).toHaveText("$38.42");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await page.waitForURL("**/billing?paid=**");
  await expect(page.getByText("37 credits were added")).toBeVisible();
  await expect(page.getByTestId("credit-balance")).toHaveText((before + 37).toLocaleString("en-US"));
  await expect(page.getByTestId("credit-ledger")).toContainText("Bought credits");
  await expect(page.getByTestId("payments")).toContainText("37 credits");
  await expectAccessible(page);
});

test("billing explains a shortfall when sent from a survey", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/billing?need=99999900");
  await expect(page.getByTestId("need-credits")).toContainText("You need 999,999 credits");
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

test("coach sees plan, marketplace listing and can gift a 360 with credits", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-coach-login").click();
  await page.waitForURL("**/coach");
  await page.goto("/coach/settings");
  await expect(page.getByTestId("coach-plan")).toContainText("Coach Starter");
  await expect(page.getByTestId("listing-form").getByLabel("Headline")).toHaveValue(/Executive coach/);
  await page.goto("/coach");
  await page.getByRole("link", { name: "Alex Morgan" }).first().click();
  await page.waitForLoadState("networkidle");
  await page.goto("/billing");
  const before = Number((await page.getByTestId("credit-balance").innerText()).replace(/,/g, ""));
  await page.goBack();
  await page.waitForLoadState("networkidle");
  await page.getByTestId("gift-full-360").click();
  await expect(page.getByText("Gifted.")).toBeVisible();
  await page.goto("/billing");
  await expect(page.getByTestId("coach-billing")).toContainText("Coach Starter");
  await expect(page.getByTestId("coach-billing")).toContainText("costs 35 credits");
  await expect(page.getByTestId("credit-balance")).toHaveText((before - 35).toLocaleString("en-US"));
  await expect(page.getByTestId("credit-ledger")).toContainText("Gifted a 360 to a client");
});

test("company owner sees the plan and company credits, and can add credits", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs**");
  // Company billing lives in the company workspace (Phase 11e).
  await page.goto("/billing");
  await page.getByTestId("org-billing").getByRole("link", { name: /Brightline Studio billing/ }).click();
  await page.waitForURL(/\/orgs\/[^/]+\/billing$/);
  await expect(page.getByTestId("company-plan-status")).toContainText("Paid until");
  await expect(page.getByTestId("org-billing")).toContainText("12 credits per person");
  const before = Number((await page.getByTestId("org-credits").innerText()).replace(/,/g, ""));
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "250", exact: true }).click();
  await page.getByTestId("org-billing").getByTestId("buy-credits-button").click();
  await page.waitForURL("**/billing/checkout/**");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await page.waitForURL(/\/orgs\/[^/]+\/billing\?paid=/);
  await expect(page.getByTestId("org-credits")).toHaveText((before + 250).toLocaleString("en-US"));
  await expect(page.getByTestId("org-credit-ledger")).toContainText("Bought credits");
  await expectAccessible(page);
});

test("platform admin edits pricing and adds a discount", async ({ page }) => {
  test.skip(!(process.env.PLATFORM_ADMIN_EMAILS ?? "").includes("demo@mirror.local"), "needs PLATFORM_ADMIN_EMAILS=demo@mirror.local");
  await demoLogin(page);
  await page.goto("/admin/pricing");
  await expect(page.getByRole("heading", { name: "Pricing", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/^Pulse check/).fill("9.50");
  await page.getByTestId("save-policy").click();
  await expect(page.getByText("Saved 1 change.")).toBeVisible();
  await expect(page.getByTestId("pricing-history")).toContainText("pulse 900 → 950");
  await page.goto("/billing");
  await expect(page.getByTestId("price-list")).toContainText("9.50 credits");
  // Put it back.
  await page.goto("/admin/pricing");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/^Pulse check/).fill("9");
  await page.getByTestId("save-policy").click();
  await expect(page.getByText("Saved 1 change.")).toBeVisible();

  const form = page.getByTestId("discount-form");
  await form.getByLabel("For").selectOption("user");
  await form.getByLabel("Person's email").fill("priya@coaches.mirror.local");
  await form.getByLabel("Percent off").fill("15");
  await form.getByLabel("Note (optional)").fill("Partner coach");
  await form.getByTestId("add-discount").click();
  await expect(page.getByTestId("discounts")).toContainText("Priya Shah");
  await expect(page.getByTestId("discounts")).toContainText("15%");
  await expectAccessible(page);
});
