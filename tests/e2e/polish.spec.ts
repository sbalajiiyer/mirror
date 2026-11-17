import { expect, test } from "@playwright/test";
import { demoLogin, expectAccessible, raterLinksFromOutbox } from "./helpers";

test("raters can answer in Spanish or German; built-in statements are translated", async ({ page }) => {
  const email = `es.rater.${Date.now()}@example.com`;
  await demoLogin(page);
  await page.getByRole("link", { name: /Leadership check-in — Winter 2026/ }).first().click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Add someone to/ }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(email)).toBeVisible();
  const [link] = await raterLinksFromOutbox(page, [email]);

  await page.goto(`${link}?lang=es`);
  await expect(page.getByRole("heading", { name: "A Alex le gustaría conocer tu opinión" })).toBeVisible();
  await expect(page.locator("[lang=es]").first()).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByText("Sección 1 de 7")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Liderazgo" })).toBeVisible();
  await expect(page.getByText("Alex marca una dirección clara que los demás pueden seguir.")).toBeVisible();
  await expect(page.getByText("Casi siempre").first()).toBeVisible();

  // Switching language keeps your place (progress is saved as you go).
  await page.getByTestId("rater-language").selectOption("de");
  await page.waitForURL(/lang=de/);
  await expect(page.getByRole("heading", { name: "Führung" })).toBeVisible();
  await expect(page.getByText("Alex gibt eine klare Richtung vor, der andere folgen können.")).toBeVisible();
  // The choice sticks for this device.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Alex freut sich über Ihr Feedback" })).toBeVisible();
});

test("dark mode switch, and the report and dashboard stay accessible in dark mode", async ({ page }) => {
  await demoLogin(page);
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);
  await page.getByTestId("theme-toggle").first().click(); // match device → light
  await page.getByTestId("theme-toggle").first().click(); // light → dark
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/); // remembered, applied before paint
  await expectAccessible(page);
  await page.getByTestId("survey").filter({ hasText: "Pre-promotion 360" }).getByRole("link", { name: /Pre-promotion 360/ }).click();
  await page.waitForURL(/\/report$/);
  await expect(page.getByTestId("report")).toBeVisible();
  await expectAccessible(page);
  await page.getByTestId("theme-toggle").first().click(); // dark → match device
  await expect(html).not.toHaveClass(/dark/);
});

test("group report comments by meaning with AI", async ({ page }) => {
  await demoLogin(page);
  // The baseline session (S1) has the written comments.
  await page.getByTestId("survey").filter({ hasText: "Pre-promotion 360" }).getByTestId("session-row").filter({ hasText: "Baseline" }).click();
  await page.waitForURL(/\/report$/);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("ai-themes-button").click();
  await expect(page.getByTestId("ai-themes")).toBeVisible();
  await expect(page.getByRole("button", { name: "By keyword" })).toBeVisible();
  await page.getByRole("button", { name: "By keyword" }).click();
  await expect(page.getByTestId("ai-themes")).toHaveCount(0);
});

test("AI coach replies appear as they're written", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/chat");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("new-report-chat").getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/chat\/[^/?]+$/);
  await page.waitForLoadState("networkidle");
  const lengths: number[] = [];
  await page.getByLabel("Your message").fill("What is my biggest strength?");
  await page.getByRole("button", { name: "Send" }).click();
  const msg = page.getByTestId("msg-assistant").first();
  await expect(msg).toBeVisible();
  for (let i = 0; i < 6; i++) {
    lengths.push(((await msg.textContent()) ?? "").length);
    await page.waitForTimeout(40);
  }
  await expect(msg).toContainText("Sample reply");
  expect(new Set(lengths).size).toBeGreaterThan(1); // it grew while streaming
  await expect(msg).not.toContainText("[[facts]]");
  await expect(page.getByTestId("chat-messages")).toHaveAttribute("aria-busy", "false");
  await page.reload();
  await expect(page.getByTestId("msg-assistant")).toHaveCount(1); // saved
});

test("a coach gets a coach onboarding, not the self-360 questions", async ({ page }) => {
  const email = `coach.${Date.now()}@example.com`;
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto("/dev/outbox");
  const link = await page.getByTestId("outbox-mail").filter({ hasText: `→ ${email}` }).first().locator('a[href*="/api/auth/callback/email"]').getAttribute("href");
  await page.goto(link!);
  await page.waitForURL("**/onboarding");
  await page.getByTestId("coach-onboarding-link").click();
  await page.waitForURL("**/onboarding/coach");
  await expectAccessible(page);
  await page.getByLabel("Your name (shown to clients)").fill("Robin Coach");
  await page.getByLabel("Practice or brand name (optional)").fill("Robin Coaching");
  await page.getByRole("button", { name: "Open my coach workspace" }).click();
  await page.waitForURL("**/coach");
  await expect(page.getByText("Robin Coaching")).toBeVisible();
});
