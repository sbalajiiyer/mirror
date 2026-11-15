import { expect, test } from "@playwright/test";
import { demoLogin } from "./helpers";

// Runs with AI_PROVIDER=mock, so outputs are deterministic sample text (no API key needed).

test("AI summary can be written and regenerated on the report", async ({ page }) => {
  await demoLogin(page);
  await page.getByRole("link", { name: /Pre-promotion 360/ }).click();
  await page.waitForURL(/\/report$/);
  const card = page.getByTestId("ai-summary-card");
  if (!(await card.isVisible())) await page.getByTestId("ai-summary").click();
  await expect(card).toBeVisible();
  await expect(card).toContainText("What others value");
  await expect(card).toContainText("Where to grow");
  await page.getByRole("button", { name: "Regenerate AI summary" }).click();
  await expect(card).toBeVisible();
});

test("development plan is created and action progress persists", async ({ page }) => {
  await demoLogin(page);
  await page.getByRole("link", { name: /Pre-promotion 360/ }).click();
  await page.waitForURL(/\/report$/);
  await page.getByRole("link", { name: "Development plan" }).click();
  await page.waitForURL(/\/plan$/);
  const plan = page.getByTestId("plan");
  if (!(await plan.isVisible())) {
    await page.getByLabel("How do you like to learn?").selectOption("practice");
    await page.getByTestId("create-plan").click();
  }
  await expect(plan).toBeVisible();
  await expect(plan.getByRole("heading", { name: "Communication" })).toBeVisible();
  await expect(plan.getByText("30 days").first()).toBeVisible();

  const first = plan.getByRole("checkbox").first();
  const wasChecked = await first.isChecked();
  await first.click();
  await expect(first).toBeChecked({ checked: !wasChecked });
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByTestId("plan").getByRole("checkbox").first()).toBeChecked({ checked: !wasChecked });
});

test("wizard recommends a focus and drafts the invite message", async ({ page }) => {
  await demoLogin(page);
  await page.getByRole("link", { name: /New 360/ }).click();
  await page.getByRole("button", { name: /Grow as a leader/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByTestId("recommend").click();
  await expect(page.getByTestId("recommendation")).toContainText("Leadership");
  await page.getByRole("button", { name: /Use only these/ }).click();
  await expect(page.getByText(/16 statements/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // questions
  await page.getByLabel("Peers rater email").fill(`x.${Date.now()}@example.com`);
  await page.getByTestId("group-PEER").getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // raters
  await page.getByLabel("Invite message").fill("");
  await page.getByTestId("draft-invite").click();
  await expect(page.getByLabel("Invite message")).not.toHaveValue("");
});

test("settings: free model selected, premium shown as coming soon", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/settings");
  await expect(page.getByRole("radio", { name: /Standard \(free\)/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Premium — Claude/ })).toBeDisabled();
  await page.getByLabel("Tone of AI feedback").selectOption("direct");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Tone of AI feedback")).toHaveValue("direct");
});
