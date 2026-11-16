import { expect, test, type Page } from "@playwright/test";
import { demoLogin, expectAccessible } from "./helpers";

async function openReport(page: Page) {
  await page.getByTestId("survey").filter({ hasText: "Pre-promotion 360" }).getByRole("link", { name: /Pre-promotion 360/ }).click();
  await page.waitForURL(/\/report$/);
}

test("ask the AI coach about a report and practise a conversation", async ({ page }) => {
  await demoLogin(page);
  await openReport(page);
  await page.getByRole("link", { name: "Ask the AI coach" }).click();
  await page.waitForURL(/\/chat\?report=/);
  await page.waitForLoadState("networkidle");
  await expectAccessible(page);
  await page.getByTestId("new-report-chat").getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/chat\/[^/?]+$/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Your message").fill("What should I work on first?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("msg-assistant")).toHaveCount(1);
  await expect(page.getByTestId("msg-assistant")).toContainText(/strength/i);
  await expectAccessible(page);

  await page.goto("/chat");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("new-roleplay").getByLabel("Situation", { exact: true }).selectOption({ label: "Ask your manager for a promotion" });
  await page.getByRole("button", { name: "Start role-play" }).click();
  await page.waitForURL(/\/chat\/[^/?]+$/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("The AI plays a busy, fair manager")).toBeVisible();
  await page.getByLabel("Your message").fill("I'd like to talk about moving to the next level.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("msg-assistant")).toHaveCount(1);
  await page.getByRole("button", { name: "How am I doing?" }).click();
  await expect(page.getByTestId("msg-assistant")).toHaveCount(2);
  await expect(page.getByTestId("msg-assistant").nth(1)).toContainText(/Stepping out/);
  await page.goto("/chat");
  await expect(page.getByTestId("chat-list")).toContainText("Ask your manager for a promotion");
});

test("share a verified strengths badge and a summary; revoke stops access", async ({ page, browser }) => {
  await demoLogin(page);
  await openReport(page);
  await page.getByRole("link", { name: "Share" }).click();
  await page.waitForURL(/\/share$/);
  await page.waitForLoadState("networkidle");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Create link" }).click();
  const link = page.getByTestId("share-link").first();
  await expect(link).toContainText("Verified strengths badge");
  await expect(link.getByRole("link", { name: "Add to LinkedIn profile" })).toHaveAttribute("href", /linkedin\.com\/profile\/add\?startTask=CERTIFICATION_NAME/);
  const url = new URL((await link.getByTestId("share-url").textContent())!.trim());

  const anon = await browser.newContext();
  const p2 = await anon.newPage();
  await p2.goto(url.pathname);
  await expect(p2.getByTestId("shared-badge")).toContainText("Verified strengths");
  await expect(p2.getByTestId("shared-badge")).toContainText("Alex Morgan");
  await expectAccessible(p2);
  const svg = await p2.request.get(`${url.pathname}/badge.svg`);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");

  // A one-page summary with chosen sections.
  await page.getByLabel(/One-page summary/).check();
  await page.getByLabel("Growth areas").check();
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByTestId("share-link")).toHaveCount(2);
  const sUrl = new URL((await page.getByTestId("share-link").first().getByTestId("share-url").textContent())!.trim());
  await p2.goto(sUrl.pathname);
  await expect(p2.getByTestId("shared-summary")).toContainText("Growth areas");
  await expect(p2.getByTestId("shared-summary")).toContainText("Strengths");

  // Revoke the badge.
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("share-link").nth(1).getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByTestId("share-link").nth(1)).toContainText("Revoked");
  await p2.goto(url.pathname);
  await expect(p2.getByText("This link isn't available")).toBeVisible();
  await anon.close();
});

test("weekly nudges are opt-in and the wizard suggests questions for your goal", async ({ page }) => {
  await demoLogin(page);
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Weekly nudge email")).toHaveValue("");
  await page.getByLabel("Weekly nudge email").selectOption({ label: "Every Monday" });
  await page.getByTestId("nudge-form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("nudge-form").getByRole("status")).toContainText("Saved");
  await page.reload();
  await expect(page.getByLabel("Weekly nudge email")).toHaveValue("1");

  await page.goto("/assessments/new");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/28 statements/)).toBeVisible();
  await page.getByRole("button", { name: "Suggest for my goal and role" }).click();
  await expect(page.getByTestId("adaptive").getByRole("status")).toContainText("Your goal puts the most weight on");
  await expect(page.getByText(/28 statements/)).toHaveCount(0);
});
