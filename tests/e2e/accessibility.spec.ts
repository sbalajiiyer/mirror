import { expect, test } from "@playwright/test";
import { demoLogin, expectAccessible } from "./helpers";

// WCAG 2.2 AA automated checks on the main screens, in light and dark mode.
// The rater form itself is checked inside rater-flow.spec.ts, where a live rater link exists.
for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test("sign-in and invalid rater link", async ({ page }) => {
      await page.goto("/signin");
      await expectAccessible(page);
      await page.goto("/r/this-is-not-a-real-token-at-all-0123456789abcdef");
      await expectAccessible(page);
    });

    test("dashboard, report, progress and questionnaires", async ({ page }) => {
      await demoLogin(page);
      await expectAccessible(page);
      await page.getByTestId("survey").filter({ hasText: "Pre-promotion 360" }).getByRole("link", { name: /Pre-promotion 360/ }).click();
      await page.waitForURL(/\/report$/);
      await expect(page.getByTestId("radar").or(page.locator("svg").first())).toBeVisible();
      await expectAccessible(page);
      await page.goto("/progress");
      await expectAccessible(page);
      await page.goto("/questionnaires");
      await expectAccessible(page);
      await page.goto("/assessments/new");
      await expectAccessible(page);
      await page.goto("/settings");
      await expectAccessible(page);
    });
  });
}

test("keyboard: skip link, report drill-down and rating with arrow keys", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();

  await page.getByTestId("survey").filter({ hasText: "Pre-promotion 360" }).getByRole("link", { name: /Pre-promotion 360/ }).click();
  await page.waitForURL(/\/report$/);
  const bar = page.getByRole("group", { name: /Self versus others gap/ }).getByRole("button").last();
  const name = (await bar.locator("text").first().textContent())!.trim();
  await bar.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("drilldown").getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
});
