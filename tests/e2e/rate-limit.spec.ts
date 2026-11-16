import { expect, test } from "@playwright/test";

// Each test uses its own made-up client address so it never throttles the rest of the suite.
const ip = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}, 10.0.0.1`;

test("guessing rater links from one network is throttled", async ({ browser }) => {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip() } });
  const page = await ctx.newPage();
  for (let i = 0; i < 10; i++) {
    await page.goto(`/r/guess-${i}-${"x".repeat(40)}`);
    await expect(page.getByText("Link not recognised")).toBeVisible();
  }
  await page.goto(`/r/guess-final-${"x".repeat(40)}`);
  await expect(page.getByRole("heading", { name: "Please slow down" })).toBeVisible();
  await ctx.close();
});

test("too many sign-in emails to one address are refused politely", async ({ browser }) => {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip() } });
  const page = await ctx.newPage();
  const email = `limit-${Date.now()}@example.com`;
  for (let i = 0; i < 5; i++) {
    await page.goto("/signin");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  }
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/Too many sign-in attempts/)).toBeVisible();
  await ctx.close();
});
