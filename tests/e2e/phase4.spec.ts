import { expect, test } from "@playwright/test";
import { demoLogin, rateAllSections } from "./helpers";

test("build a questionnaire for free and use it in a new 360", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/questionnaires");
  await page.getByRole("link", { name: "Start building" }).click();
  await page.getByLabel("Questionnaire name").fill(`E2E custom ${Date.now()}`);
  await page.getByLabel("Section 1", { exact: true }).fill("Customer focus");
  const s1 = ["{name} asks customers what they need.", "{name} follows up on customer issues.", "{name} explains trade-offs to customers."];
  for (const [i, t] of s1.entries()) await page.getByLabel(`Section 1 statement ${i + 1}`, { exact: true }).fill(t);
  // Self-assessment wording is filled in automatically.
  await expect(page.getByLabel("Section 1 statement 1 self wording")).toHaveValue("I ask customers what they need.");
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByLabel("Section 2", { exact: true }).fill("Ownership");
  for (const [i, t] of ["{name} owns mistakes.", "{name} finishes what they start.", "{name} raises risks early."].entries()) {
    await page.getByLabel(`Section 2 statement ${i + 1}`, { exact: true }).fill(t);
  }
  await page.getByTestId("save-questionnaire").click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByRole("link", { name: "Use in a new 360" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // goal → framework
  await expect(page.getByRole("radio", { name: /E2E custom/ })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click(); // → questions
  await expect(page.getByRole("group", { name: "Customer focus" })).toBeVisible();
  await expect(page.getByText(/6 statements/)).toBeVisible();
});

test("generate a questionnaire with AI for 1 credit", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/questionnaires/new?ai=1");
  const before = Number((await page.getByTestId("credit-balance").innerText()).match(/\d+/)![0]);
  test.skip(before < 1, "demo account has no credits left (reseed to reset)");
  await page.getByLabel("What do you want feedback on?").fill("I recently became a team lead and want feedback on how I run 1:1s and planning.");
  await page.getByTestId("generate-questionnaire").click();
  await expect(page.getByTestId("generated-alert")).toBeVisible();
  await expect(page.getByTestId("builder-section").first()).toBeVisible();
  await page.goto("/questionnaires");
  await expect(page.getByTestId("credit-balance")).toContainText(`${before - 1} credit`);
  await expect(page.getByText("AI-generated").first()).toBeVisible();
});

test("progress page shows trends, before/after and goals", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/progress");
  await expect(page.getByTestId("progress")).toBeVisible();
  await expect(page.getByTestId("trends")).toBeVisible();
  await expect(page.getByTestId("trend-chart").filter({ hasText: "Communication" })).toContainText("4 statements asked every time");
  await expect(page.getByTestId("before-after")).toContainText("Communication");
  await expect(page.getByTestId("goal").filter({ hasText: "Raise communication" })).toBeVisible();
  await expect(page.getByTestId("streak")).toHaveText("1");

  const select = page.getByLabel("New goal");
  const option = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(option!);
  await page.getByTestId("add-goal").click();
  await expect(page.getByTestId("goal")).toHaveCount(2);
});

test("start a pulse check from a report with suggested statements and the same raters", async ({ page }) => {
  await demoLogin(page);
  await page.getByRole("link", { name: /Pre-promotion 360/ }).click();
  await page.waitForURL(/\/report$/);
  await page.getByRole("link", { name: "Start a pulse check" }).click();
  await expect(page.getByText(/of 5–10 chosen/)).toBeVisible();
  const chosen = await page.getByRole("checkbox", { checked: true }).count();
  expect(chosen).toBeGreaterThanOrEqual(6); // 5–10 statements + "same people" box
  await expect(page.getByText(/Ask the same 12 people again/)).toBeVisible();
  await page.getByTestId("create-pulse").click();
  await page.waitForURL(/\/self$/);
  await page.getByRole("button", { name: "Start" }).click();
  await rateAllSections(page, [4]);
  await page.getByRole("button", { name: "Submit & lock" }).click();
  await page.waitForURL(/\/assessments\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /Pre-promotion 360.*· S\d+ Pulse check/ })).toBeVisible();
  await expect(page.getByText("12 people will get an email")).toBeVisible();
});
