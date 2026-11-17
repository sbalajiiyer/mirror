import { expect, test } from "@playwright/test";
import { demoLogin, expectAccessible } from "./helpers";

test("an admin switches between Personal and the company; menus change with the workspace", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs");
  await page.goto("/dashboard");
  const switcher = page.getByTestId("workspace-switcher");
  const nav = page.getByRole("navigation", { name: "Main" });

  await switcher.selectOption({ label: "Personal" });
  await page.waitForURL("**/dashboard");
  await expect(switcher).toHaveValue("personal");
  await expect(nav.getByRole("link", { name: "Billing" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Company" })).toHaveCount(0);

  await switcher.selectOption({ label: "Brightline Studio" });
  await page.waitForURL("**/dashboard");
  await expect(switcher).toHaveValue(/^org:/);
  await expect(nav.getByRole("link", { name: "My rounds" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Company" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Billing" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Questionnaires" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /New 360/ })).toHaveCount(0);
  await expectAccessible(page);

  // The choice is remembered.
  await page.reload();
  await expect(switcher).toHaveValue(/^org:/);
  await nav.getByRole("link", { name: "Company" }).click();
  await expect(page.getByRole("heading", { name: "Brightline Studio" })).toBeVisible();
});

test("opening a company page makes it the active workspace", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs");
  await page.goto("/dashboard");
  await page.getByTestId("workspace-switcher").selectOption({ label: "Personal" });
  await page.waitForURL("**/dashboard");
  await page.goto("/orgs");
  await page.getByTestId("org-row").filter({ hasText: "Brightline Studio" }).click();
  await expect(page.getByTestId("workspace-switcher")).toHaveValue(/^org:/);
});

test("someone with no company sees only Personal, plus a way to companies", async ({ page }) => {
  await demoLogin(page);
  const switcher = page.getByTestId("workspace-switcher");
  await expect(switcher).toHaveValue("personal");
  await switcher.selectOption({ label: "Companies…" });
  await page.waitForURL("**/orgs");
});

test("a company admin can switch off copying reports for people who leave", async ({ page }) => {
  await page.goto("/signin");
  await page.getByTestId("demo-admin-login").click();
  await page.waitForURL("**/orgs");
  await page.getByTestId("org-row").filter({ hasText: "Brightline Studio" }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
  await page.goto(`${page.url()}/settings`);
  const box = page.getByTestId("allow-personal-copy");
  await expect(box).toBeChecked();
  await box.uncheck();
  await page.getByRole("button", { name: "Save data settings" }).click();
  await expect(page.getByTestId("org-data-form")).toContainText("Saved.");
  await page.reload();
  await expect(page.getByTestId("allow-personal-copy")).not.toBeChecked();
  await page.getByTestId("allow-personal-copy").check();
  await page.getByRole("button", { name: "Save data settings" }).click();
  await expect(page.getByTestId("org-data-form")).toContainText("Saved.");
});
