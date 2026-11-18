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

/**
 * WCAG 2.2 A/AA checks with axe. Fails with a readable list of rule ids, targets and help text.
 * `exclude` is for third-party widgets we don't control; keep it empty where possible.
 */
export async function expectAccessible(page: Page, exclude: string[] = []) {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  // After a client-side navigation Next.js streams the page metadata in, so the <title> can lag the
  // content by a moment. Scan once the page has its title (a missing title still fails below).
  await page.waitForFunction(() => document.title.trim().length > 0, null, { timeout: 5000 }).catch(() => {});
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  for (const sel of exclude) builder = builder.exclude(sel);
  const { violations } = await builder.analyze();
  const report = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 5).map((n) => n.target.join(" ")).join("\n    ")}`);
  expect(report, `Accessibility violations on ${page.url()}`).toEqual([]);
}

/** The age gate a new account sees first: a neutral birth month/year question and the terms. */
export async function passAgeCheck(page: Page, year = 1990) {
  await page.waitForURL("**/welcome**");
  await page.getByLabel("Month").selectOption("6");
  await page.getByLabel("Year").selectOption(String(year));
  await page.getByTestId("accept-terms").check();
  await page.getByTestId("age-continue").click();
}
