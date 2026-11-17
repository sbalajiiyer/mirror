import { expect, test } from "@playwright/test";
import { demoLogin, expectAccessible } from "./helpers";

test("benchmarks on the report", async ({ page }) => {
  await demoLogin(page);
  await page.getByTestId("survey").filter({ hasText: "Pre-promotion 360" }).getByRole("link", { name: /Pre-promotion 360/ }).click();
  await page.waitForURL(/\/report$/);
  const b = page.getByTestId("benchmarks");
  await expect(b).toContainText("career stage (Senior");
  await expect(b.locator("tbody tr")).toHaveCount(7);
  await expect(b).toContainText(/Top|middle|quarter/);
});

test("personal dashboard: widgets, CSV, plain-English question and schedule", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/dashboards");
  await page.getByTestId("dashboard-list").getByRole("link", { name: /My growth/ }).click();
  await page.waitForURL(/\/dashboards\/[^/]+$/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("widget")).toHaveCount(4);
  await expect(page.getByTestId("widget").filter({ hasText: "Trend across sessions" })).toContainText("S3");
  await expectAccessible(page);

  const csvLink = page.getByTestId("widget").first().getByRole("link", { name: "CSV" });
  const res = await page.request.get((await csvLink.getAttribute("href"))!);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(await res.text()).toMatch(/^Competency,Others,Self,Gap\r\n/);

  await page.getByLabel("Ask a question about your data").fill("Show all my sessions and their status");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByTestId("ask-result")).toContainText("All sessions");
  await page.getByTestId("ask-result").getByRole("button", { name: "Add to dashboard" }).click();
  await expect(page.getByTestId("widget")).toHaveCount(5);

  const sched = page.getByTestId("schedule-form").locator("select");
  await sched.first().selectOption("weekly");
  await sched.nth(1).selectOption({ label: "Friday" });
  await page.getByTestId("schedule-form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("schedule-form").getByRole("status")).toContainText("Saved");
});

test("org admin dashboard and a new dashboard from scratch", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs");
  // Company dashboards live in the company workspace (Phase 11).
  await page.getByTestId("workspace-switcher").selectOption({ label: "Brightline Studio" });
  await page.waitForURL("**/dashboard");
  await page.goto("/dashboards");
  await page.getByTestId("dashboard-list").getByRole("link", { name: /People overview/ }).click();
  await page.waitForURL(/\/dashboards\/[^/]+$/);
  await expect(page.getByTestId("widget").filter({ hasText: "Participation" })).toContainText("Autumn 2026 360");
  await expect(page.getByTestId("widget").filter({ hasText: "Team profile: Engineering" })).toContainText("Spread");
  await expect(page.getByTestId("widget").filter({ hasText: "Cohort comparison" })).toContainText("Change");

  await page.goto("/dashboards");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("create-dashboard").getByRole("textbox").fill("Quarterly people review");
  await page.getByTestId("create-dashboard").locator("select").selectOption({ label: "Organization: Brightline Studio" });
  await page.getByRole("button", { name: "Create dashboard" }).click();
  await page.waitForURL(/\/dashboards\/[^/]+$/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("widget")).toHaveCount(2);
  const add = page.getByTestId("add-widget").locator("select");
  await add.first().selectOption({ label: "Team profile" });
  await add.nth(1).selectOption({ label: "Product" });
  await page.getByRole("button", { name: "Add widget" }).click();
  await expect(page.getByTestId("widget")).toHaveCount(3);
  await expect(page.getByTestId("widget").filter({ hasText: "Team profile: Product" })).toBeVisible();
});

test("API tokens and benchmark contribution in Settings", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("benchmark-toggle").getByRole("checkbox")).toBeChecked();
  await page.getByLabel("Token name").fill("Spreadsheet");
  await page.getByRole("button", { name: "Create token" }).click();
  const token = (await page.getByTestId("new-token").locator("code").textContent())!.trim();
  expect(token).toMatch(/^mrr_/);
  const res = await page.request.get("/api/v1/sessions", { headers: { authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(200);
  expect((await res.json()).data.length).toBeGreaterThan(0);
  expect((await page.request.get("/api/v1/sessions")).status()).toBe(401);
});
