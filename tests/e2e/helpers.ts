import { expect, type Page } from "@playwright/test";

export async function demoLogin(page: Page) {
  await page.goto("/signin");
  await page.getByTestId("demo-login").click();
  await page.waitForURL("**/dashboard");
}

/** Answer every rating on the current questionnaire step with `value`. */
export async function rateStep(page: Page, value: number) {
  const questions = page.getByTestId("rating-question");
  const count = await questions.count();
  for (let i = 0; i < count; i++) {
    await questions.nth(i).locator("label").filter({ hasText: new RegExp(`^${value}`) }).click();
  }
  return count;
}

/** Click through all competency sections, rating each with the given values (cycled). */
export async function rateAllSections(page: Page, values: number[]) {
  let i = 0;
  while (await page.getByTestId("rating-question").first().isVisible().catch(() => false)) {
    await rateStep(page, values[i++ % values.length]);
    await page.getByRole("button", { name: /^Next/ }).click();
  }
}

export async function raterLinksFromOutbox(page: Page, emails: string[]) {
  await page.goto("/dev/outbox");
  const links: string[] = [];
  for (const email of emails) {
    const mail = page.getByTestId("outbox-mail").filter({ hasText: `→ ${email}` }).first();
    await expect(mail).toBeVisible();
    const href = await mail.locator('a[href*="/r/"]').first().getAttribute("href");
    links.push(new URL(href!).pathname);
  }
  return links;
}
