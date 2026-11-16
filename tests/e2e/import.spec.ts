import { expect, test } from "@playwright/test";
import { demoLogin } from "./helpers";

test("import a Microsoft Forms export, review it in the builder and save it for free", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/questionnaires");
  await page.getByRole("link", { name: "Start building" }).click();
  await page.getByTestId("import-file").setInputFiles("tests/fixtures/microsoft-forms-export.xlsx");
  await expect(page.getByTestId("import-result")).toContainText("Imported 6 statements in 1 sections");
  await expect(page.getByTestId("import-warnings")).toContainText("answers were ignored");
  await expect(page.getByLabel("Questionnaire name")).toHaveValue("microsoft forms export");
  await page.getByLabel("Questionnaire name").fill("Imported team 360");
  await expect(page.getByTestId("builder-section")).toHaveCount(1);
  await expect(page.getByTestId("builder-section").locator("input").nth(2)).toHaveValue("{name} takes ownership of mistakes");
  await page.getByRole("button", { name: /^Save/ }).click();
  await page.waitForURL(/\/questionnaires\/[^/]+\?saved=1/);
});

test("the CSV template imports cleanly and bad files get a clear message", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/questionnaires/new");
  await page.getByTestId("import-file").setInputFiles("tests/fixtures/template.csv");
  await expect(page.getByTestId("import-result")).toContainText("Imported 6 statements in 2 sections");
  await expect(page.getByTestId("import-warnings")).toHaveCount(0);
  await expect(page.getByTestId("builder-section")).toHaveCount(2);
  await page.getByTestId("import-file").setInputFiles({ name: "notes.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("x") });
  await expect(page.getByTestId("import-card").getByRole("alert")).toContainText("save it as .xlsx or .csv");
});
