import { expect, test } from "@playwright/test";
import { demoLogin } from "./helpers";

test("dashboard groups sessions under their survey with an ID", async ({ page }) => {
  await demoLogin(page);
  const survey = page.getByTestId("survey").filter({ hasText: "Pre-promotion 360" });
  await expect(survey.getByTitle("Survey ID")).toHaveText(/^MRR-[A-Z2-9]{6}$/);
  // Seed has 3 sessions; earlier specs may have added a pulse on top.
  expect(await survey.getByTestId("session-row").count()).toBeGreaterThanOrEqual(3);
  await expect(survey.getByTestId("session-row").filter({ hasText: "Winter re-run" })).toContainText("S3");
  await expect(survey.getByTestId("session-row").filter({ hasText: "Baseline" })).toContainText("S1");
});

test("progress compares full sessions on every statement", async ({ page }) => {
  await demoLogin(page);
  // Other specs create newer surveys, so open this survey's trends from its card.
  await page.getByTestId("survey").filter({ hasText: "Pre-promotion 360" }).getByRole("link", { name: "Trends" }).click();
  await page.waitForURL(/\/progress\?series=/);
  await page.getByRole("button", { name: "Full sessions only" }).click();
  await expect(page.getByTestId("trend-chart").filter({ hasText: "Leadership" })).toContainText("4 statements asked every time");
  await expect(page.getByLabel("Before")).toHaveValue(/.+/);
  await expect(page.getByTestId("before-after")).toContainText("S3 · Full 360 · Winter re-run");
});

test("run the same survey again as a new session", async ({ page }) => {
  await demoLogin(page);
  const survey = page.getByTestId("survey").filter({ hasText: "Pre-promotion 360" });
  // Only one session can be open per survey. An earlier spec may have left a pulse open: close it first.
  if (!(await survey.getByRole("link", { name: "Run again" }).isVisible())) {
    await expect(survey.getByText("Finish the session in progress")).toBeVisible();
    await survey.getByTestId("session-row").first().click();
    await expect(page.getByTestId("launch").or(page.getByTestId("close"))).toBeVisible();
    if (await page.getByTestId("launch").isVisible()) await page.getByTestId("launch").click();
    page.once("dialog", (d) => d.accept());
    await page.getByTestId("close").click();
    await page.waitForURL(/\/report$/);
    await page.goto("/dashboard");
  }
  const next = (await survey.getByTestId("session-row").count()) + 1;
  await survey.getByRole("link", { name: "Run again" }).click();
  await expect(page.getByText(/this will be/)).toContainText(`session ${next}`);
  await page.getByLabel("Session name").fill("Spring 2027");
  await page.getByTestId("rerun").click();
  await page.waitForURL(/\/self$/);
  await expect(page.getByText("Section 1 of 7").or(page.getByRole("button", { name: "Start" }))).toBeVisible();
  await page.goto("/dashboard");
  const row = survey.getByTestId("session-row").first();
  await expect(row).toContainText("Spring 2027");
  await expect(row).toContainText(`S${next}`);
  await expect(survey.getByRole("link", { name: "Run again" })).toHaveCount(0);
});
