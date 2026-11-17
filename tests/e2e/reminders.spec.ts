import { expect, test } from "@playwright/test";
import { demoLogin, expectAccessible } from "./helpers";

test("remind raters from one screen: pick, preview, send", async ({ page }) => {
  await demoLogin(page);
  await page.getByRole("link", { name: /Leadership check-in/ }).first().click();
  await page.waitForURL(/\/assessments\/[^/]+$/);
  const panel = page.getByTestId("reminders-panel");
  await expect(panel).toBeVisible();
  await page.waitForLoadState("networkidle");

  // People who already responded can't be selected, and say why.
  await panel.getByRole("button", { name: "Everyone" }).click();
  await expect(panel.getByTestId("reminder-row").filter({ hasText: "Sam Patel" }).getByTestId("reminder-reason")).toHaveText("Already responded");
  await panel.getByRole("button", { name: "Can be reminded" }).click();
  await expect(panel.getByTestId("reminder-row").filter({ hasText: "Leo Garcia" })).toHaveCount(1);
  await expect(panel.getByTestId("reminder-row").filter({ hasText: "Sam Patel" })).toHaveCount(0);

  // Started-but-not-finished filter, a personal line, and the preview.
  await panel.getByRole("button", { name: "Started, not finished" }).click();
  await expect(panel.getByTestId("reminder-row").filter({ hasText: "Riya Kapoor" })).toHaveCount(1);
  await expect(panel.getByTestId("reminder-row").filter({ hasText: "Leo Garcia" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Everyone" }).click();
  await panel.getByRole("button", { name: "Clear" }).click();
  await panel.getByRole("checkbox", { name: "Remind Leo Garcia" }).check();
  await panel.getByTestId("reminder-row").filter({ hasText: "Leo Garcia" }).getByRole("button", { name: "Add a line" }).click();
  await panel.getByLabel("Personal line for Leo Garcia").fill("Hope the new role is going well!");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByTestId("reminder-row").filter({ hasText: "Leo Garcia" })).toContainText("Hope the new role is going well!");
  await panel.getByLabel("Tone").selectOption("formal");
  await expect(panel.getByTestId("reminder-preview")).toContainText("Dear Leo");
  await expect(panel.getByTestId("reminder-preview")).toContainText("via Mirror");

  await panel.getByTestId("send-reminders").click();
  await expect(panel.getByTestId("reminder-result")).toContainText(/Sent to 1|1 queued/);
  await expect(panel.getByTestId("reminder-history")).toContainText("Leo Garcia");
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
