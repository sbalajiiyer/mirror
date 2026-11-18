import { expect, test } from "@playwright/test";
import { demoLogin, expectAccessible } from "./helpers";

test("remind raters from one screen without seeing who has answered", async ({ page }) => {
  await demoLogin(page);
  await page.getByRole("link", { name: /Leadership check-in/ }).first().click();
  await page.waitForURL(/\/assessments\/[^/]+$/);
  const panel = page.getByTestId("reminders-panel");
  await expect(panel).toBeVisible();
  await page.waitForLoadState("networkidle");

  // No individual status anywhere on the page: not in the rater list, not in the panel.
  for (const word of ["Responded", "In progress", "Declined", "Already responded"]) await expect(page.getByText(word, { exact: true })).toHaveCount(0);
  await expect(panel).toContainText("you don't see who has answered");

  // A personal line for one person, and the preview.
  await panel.getByText(/^Personal lines/).click();
  await panel.getByTestId("reminder-row").filter({ hasText: "Leo Garcia" }).getByRole("button", { name: "Add a line" }).click();
  await panel.getByLabel("Personal line for Leo Garcia").fill("Hope the new role is going well!");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByTestId("reminder-row").filter({ hasText: "Leo Garcia" })).toContainText("Hope the new role is going well!");
  await panel.getByLabel("Tone").selectOption("formal");
  await expect(panel.getByTestId("reminder-preview")).toContainText("Dear");
  await expect(panel.getByTestId("reminder-preview")).toContainText("via Mirror");

  // One button: everyone who hasn't answered. The result names and counts no one.
  await panel.getByTestId("send-reminders").click();
  await expect(panel.getByTestId("reminder-result")).toContainText("Everyone who hasn't answered yet");
  await expect(panel.getByTestId("reminder-result")).not.toContainText(/\d+ (people|person)/);
  await expect(panel.getByTestId("reminder-history")).toContainText("Your reminder");
  await expect(panel.getByTestId("reminder-history")).not.toContainText("Leo Garcia");
  // Once every 2 days.
  await expect(panel.getByTestId("send-reminders")).toBeDisabled();
  await expectAccessible(page);
});

test("company admins remind people who haven't set up their round 360", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs");
  await page.getByTestId("org-row").filter({ hasText: "Brightline Studio" }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
  await page.goto(`${page.url()}/rounds`);
  await page.getByTestId("round-card").filter({ hasText: "Winter 2026 team 360" }).getByRole("link", { name: /send reminders/ }).click();
  await page.waitForURL(/\/rounds\/[^/]+$/);
  await page.waitForLoadState("networkidle");
  const box = page.getByTestId("round-reminders");
  await expect(box.getByTestId("round-person").first()).toBeVisible();
  await box.getByTestId("remind-participants").click();
  await expect(box).toContainText(/Reminded \d+/);
  await expectAccessible(page);
});
