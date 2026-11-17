import { expect, test } from "@playwright/test";
import { demoLogin } from "./helpers";

test("group sessions by company, theme and score, and filter by tag", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/dashboard?group=company");
  const brightline = page.getByTestId("session-group").filter({ has: page.getByText("Brightline Studio", { exact: true }) });
  await expect(brightline.getByTestId("session-row")).toHaveCount(3);
  await expect(brightline).toContainText(/others' average \d\.\d/);
  await expect(page.getByTestId("session-group").filter({ hasText: "No company set" })).toBeVisible();

  await page.goto("/dashboard?group=theme");
  await expect(page.getByTestId("session-group").filter({ hasText: "#promotion" }).first()).toBeVisible();

  await page.goto("/dashboard?group=score");
  await expect(page.getByTestId("session-group").first()).toContainText(/out of 5/);
  await expect(page.getByTestId("session-group").filter({ hasText: "No visible scores yet" })).toBeVisible();

  // Filter form works without JavaScript tricks: plain GET.
  await page.goto("/dashboard");
  await page.getByLabel("Tag").selectOption("baseline");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL(/tag=baseline/);
  await expect(page.getByTestId("session-row")).toHaveCount(1);
  await expect(page.getByTestId("session-row")).toContainText("Baseline");
  await page.getByRole("link", { name: "Clear" }).click();
  await page.waitForURL(/\/dashboard$/);
});

test("set a session's company and tags from its header", async ({ page }) => {
  await demoLogin(page);
  const card = page.getByTestId("survey").filter({ hasText: "Leadership check-in" });
  await card.getByTestId("session-row").first().click();
  await page.getByRole("button", { name: /Edit session details|Name this session/ }).click();
  await page.getByLabel("Company").fill("Contoso Health");
  await page.getByLabel("Tags (comma-separated)").fill("Leadership, New Team");
  await page.getByRole("button", { name: "Save" }).click();
  const header = page.getByTestId("session-header");
  await expect(header).toContainText("Contoso Health");
  await expect(header).toContainText("#new team");
  await page.goto("/dashboard?group=company");
  await expect(page.getByTestId("session-group").filter({ hasText: "Contoso Health" })).toContainText("Leadership check-in");
});
