import { expect, test } from "@playwright/test";
import { demoLogin } from "./helpers";

test.beforeEach(async ({ page }) => {
  await demoLogin(page);
  await page.getByRole("link", { name: /Pre-promotion 360/ }).click();
  await page.waitForURL(/\/report$/);
});

test("report renders every section from the seeded 360", async ({ page }) => {
  const report = page.getByTestId("report");
  await expect(report).toBeVisible();
  await expect(page.getByText("12 raters")).toBeVisible();
  for (const heading of ["Summary", "Competency profile", "Self vs. others", "Johari window", "By rater group", "Highest-rated behaviours", "Lowest-rated behaviours", "Question detail", "What people said", "Start · Stop · Continue"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Biggest blind spot")).toBeVisible();
  await expect(page.getByRole("img", { name: /Radar chart/ })).toBeVisible();
  await expect(page.getByTestId("report").locator("table caption")).toHaveText(/Average score per competency/);
  // No manager exception: the manager is pooled, so no column has fewer than 3 people.
  await expect(page.getByRole("columnheader", { name: /n=[12]\b/ })).toHaveCount(0);
  // No rater names or emails anywhere in the report.
  await expect(report).not.toContainText("@example.com");
  await expect(report).not.toContainText("Sam Patel");
});

test("group filter overlays a rater group on the radar, and drill-down switches competency", async ({ page }) => {
  const peers = page.getByRole("group", { name: "Filter by rater group" }).getByRole("button", { name: "Peers" });
  await peers.click();
  await expect(peers).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Legend").first()).toContainText("Peers");

  await page.getByTestId("report").getByRole("row", { name: /^Communication/ }).click();
  await expect(page.getByTestId("drilldown").getByRole("button", { name: "Communication", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("distribution-row").filter({ hasText: "listens carefully before responding" })).toBeVisible();
  await expect(page.getByTestId("distribution-row").first()).toBeVisible();
});

test("PDF export downloads a PDF", async ({ page }) => {
  const res = await page.request.get(page.url().replace(/\/assessments\/([^/]+)\/report$/, "/api/assessments/$1/report/pdf"));
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  const body = await res.body();
  expect(body.subarray(0, 4).toString()).toBe("%PDF");
  expect(body.length).toBeGreaterThan(50_000);
});

test("report API is private to its owner", async ({ request, page }) => {
  const api = page.url().replace(/\/assessments\/([^/]+)\/report$/, "/api/assessments/$1/report");
  const anon = await request.get(api, { headers: { cookie: "" } });
  expect(anon.status()).toBe(401);
  const mine = await page.request.get(api);
  const json = await mine.json();
  expect(json.report.anonymity.groups.every((g: { n: number; exempt: boolean }) => g.exempt || g.n >= 3)).toBe(true);
  expect(JSON.stringify(json)).not.toContain("@example.com");
});
