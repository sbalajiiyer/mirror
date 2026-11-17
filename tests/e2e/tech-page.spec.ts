import { expect, test } from "@playwright/test";
import { expectAccessible } from "./helpers";

const password = process.env.E2E_TECH_PASSWORD ?? "";

test("the tech page is locked, unlinked, and opens with the password", async ({ page }) => {
  test.skip(!password, "E2E_TECH_PASSWORD not set");
  // Not linked from the sign-in page or the app.
  await page.goto("/signin");
  await expect(page.locator('a[href="/tech"]')).toHaveCount(0);

  await page.goto("/tech");
  await expect(page.getByRole("heading", { name: "Private page" })).toBeVisible();
  await expect(page.getByTestId("tech-explainer")).toHaveCount(0);
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  expect(robots).toContain("noindex");
  await page.getByLabel("Password").fill("not-it");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("That password isn't right.")).toBeVisible();

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: "How Mirror works" })).toBeVisible();
  const details = page.locator("details").filter({ hasText: "How anonymity is enforced" });
  await expect(details.getByText("No join path")).toBeHidden();
  await details.locator("summary").click();
  await expect(details.getByText("No join path")).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Lock this page on this device" }).click();
  await expect(page.getByRole("heading", { name: "Private page" })).toBeVisible();
});
