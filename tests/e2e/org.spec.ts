import { expect, test, type Page } from "@playwright/test";
import { demoLogin, expectAccessible } from "./helpers";

async function adminLogin(page: Page) {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs");
  await page.getByTestId("org-row").filter({ hasText: "Brightline Studio" }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
}

test("org admin sees participation, strengths and gaps", async ({ page }) => {
  await adminLogin(page);
  await expect(page.getByRole("heading", { name: "Brightline Studio" })).toBeVisible();
  await expect(page.getByTestId("org-strengths")).toBeVisible();
  await expect(page.getByTestId("participation")).toHaveCount(3);
  await expectAccessible(page);
});

test("team heatmap names only people who share, and cohorts compare before vs after", async ({ page }) => {
  await adminLogin(page);
  await page.getByRole("link", { name: "Analytics" }).click();
  await page.getByLabel("Team or cohort").selectOption({ label: "Engineering" });
  await page.getByRole("button", { name: "Show" }).click();
  const heat = page.getByTestId("team-heatmap");
  await expect(heat).toContainText("Grace Kim");
  await expect(heat).toContainText("Isla Brown");
  await expect(heat).toContainText("Others (5)");
  await expect(heat).not.toContainText("Jonas Berg");
  await expect(page.getByTestId("team-dynamics")).toBeVisible();

  // Product: two people share but only three others don't, so only the whole team is shown.
  await page.getByLabel("Team or cohort").selectOption({ label: "Product" });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByTestId("team-heatmap")).toContainText("Whole team (5)");
  await expect(page.getByTestId("team-heatmap")).not.toContainText("Ben Okafor");

  await page.getByLabel("A: group").selectOption({ label: "Leadership programme 2026" });
  await page.getByLabel("A: round").selectOption({ label: "Spring 2026 360" });
  await page.getByLabel("B: group").selectOption({ label: "Leadership programme 2026" });
  await page.getByLabel("B: round").selectOption({ label: "Autumn 2026 360" });
  await page.getByRole("button", { name: "Compare" }).click();
  await expect(page.getByTestId("cohort-compare")).toContainText("Spring 2026 360 (6) → Leadership programme 2026 · Autumn 2026 360 (6)");
  await expect(page.getByTestId("cohort-compare").locator("tbody tr")).toHaveCount(7);
  await expectAccessible(page);
});

test("talent grid shows only opted-in people; shared reports open without comments", async ({ page }) => {
  await adminLogin(page);
  await page.getByRole("link", { name: "Talent grid" }).click();
  const grid = page.getByTestId("nine-box");
  await expect(grid).toContainText("Grace Kim");
  await expect(grid).not.toContainText("Felix Wong");
  await expect(page.getByText(/Not placed: .*Jonas Berg/)).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("link", { name: "People" }).click();
  await page.getByTestId("person-row").filter({ hasText: "Grace Kim" }).getByRole("link", { name: "Grace Kim" }).click();
  await page.getByRole("link", { name: "Autumn 2026 360" }).click();
  await expect(page.getByTestId("report")).toBeVisible();
  await expect(page.getByTestId("comments-hidden")).toBeVisible();

  // Someone who doesn't share: no report link.
  await page.goto(page.url().split("/people/")[0] + "/people");
  await page.getByTestId("person-row").filter({ hasText: "Felix Wong" }).getByRole("link", { name: "Felix Wong" }).click();
  await expect(page.getByRole("link", { name: "Autumn 2026 360" })).toHaveCount(0);
  await expect(page.getByLabel("Private").first()).toBeVisible();
});

test("a member sets up their team 360 from the round and controls consent", async ({ page }) => {
  await demoLogin(page);
  const banner = page.getByTestId("org-task-banner").filter({ hasText: "Winter 2026 team 360" });
  await banner.getByRole("link", { name: "Set up my 360" }).click();
  await expect(page.getByTestId("campaign-banner")).toContainText("Brightline Studio");
  await expect(page.getByTestId("campaign-banner")).toContainText("teammates are suggested");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Winter 2026 team 360");

  await page.goto("/orgs");
  await page.getByTestId("org-row").filter({ hasText: "Brightline Studio" }).click();
  const consent = page.getByTestId("org-consent");
  await expect(consent.getByLabel(/Share my reports/)).toBeChecked();
  await expect(consent.getByLabel(/talent grid/)).toBeChecked();
  await expectAccessible(page);
});

test("an admin creates an org, a team and a 360 round", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/orgs");
  await page.getByLabel("Organization name").fill(`Test Org ${Date.now()}`);
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
  await expect(page.getByTestId("org-profile-locked")).toBeVisible();
  await page.getByRole("link", { name: "People" }).click();
  await page.waitForURL(/\/people$/);
  await page.waitForLoadState("networkidle"); // let the form hydrate before typing
  await page.getByLabel(/Invite people/).fill("Pat Lee <pat.lee@example.com>\nsam.k@example.com");
  await page.getByRole("button", { name: "Send invitations" }).click();
  await expect(page.getByText("Invited 2.")).toBeVisible();
  await expect(page.getByTestId("person-row")).toHaveCount(3);
  await page.getByRole("link", { name: "Teams & cohorts" }).click();
  await page.waitForURL(/\/groups$/);
  await page.waitForLoadState("networkidle"); // let the form hydrate before typing
  await page.getByLabel("Name").fill("Growth");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByTestId("group-card")).toContainText("Growth");
  await page.getByRole("link", { name: "360 rounds" }).click();
  await page.waitForURL(/\/rounds$/);
  await page.waitForLoadState("networkidle"); // let the form hydrate before typing
  await page.getByLabel("Name").fill("Pilot 360");
  await page.getByRole("button", { name: "Start 360 round" }).click();
  await expect(page.getByText(/Started. Everyone taking part/)).toBeVisible();
  await expect(page.getByTestId("round-card")).toContainText("Pilot 360");
});
