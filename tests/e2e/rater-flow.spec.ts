import { expect, test } from "@playwright/test";
import { demoLogin, rateAllSections, rateStep, raterLinksFromOutbox } from "./helpers";

test("subject sets up a 360, rates self, invites raters; raters respond anonymously; report appears on close", async ({ page, browser }) => {
  const stamp = Date.now();
  const emails = [1, 2, 3].map((i) => `peer${i}.${stamp}@example.com`);

  await demoLogin(page);
  await page.getByRole("link", { name: /New 360/ }).click();

  // Wizard
  await page.getByLabel("Name").fill(`E2E 360 ${stamp}`);
  await page.getByRole("button", { name: "Continue" }).click(); // goal
  await page.getByRole("button", { name: "Continue" }).click(); // framework
  await page.getByRole("button", { name: "Continue" }).click(); // questions
  await page.getByRole("button", { name: "Remove Manager" }).click();
  for (const e of emails) {
    await page.getByLabel("Peers rater email").fill(e);
    await page.getByTestId("group-PEER").getByRole("button", { name: "Add", exact: true }).click();
  }
  await expect(page.getByText("3 people invited")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // raters
  await page.getByRole("button", { name: "Continue" }).click(); // settings
  await page.getByRole("button", { name: "Create & rate myself" }).click();

  // Self-assessment (locked after submit)
  await page.waitForURL(/\/self$/);
  await page.getByRole("button", { name: "Start" }).click();
  await rateAllSections(page, [4]);
  await page.getByRole("button", { name: "Submit & lock" }).click();
  await expect(page.getByText("Self-assessment locked")).toBeVisible();
  await page.waitForURL(/\/assessments\/[^/]+$/);
  const assessmentUrl = page.url();

  // Launch
  await page.getByTestId("launch").click();
  await expect(page.getByText("Invites sent.")).toBeVisible();

  const links = await raterLinksFromOutbox(page, emails);

  // Raters on a phone, in a separate (signed-out) browser context.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const [i, link] of links.entries()) {
    const r = await phone.newPage();
    await r.goto(link);
    await expect(r.getByText(/would value your feedback/)).toBeVisible();
    await expect(r.getByText(/Anonymous:/)).toBeVisible();
    await r.getByRole("button", { name: "Start" }).click();

    if (i === 0) {
      // Save & resume: answer one section, wait for autosave, reload.
      await rateStep(r, 3);
      await r.getByRole("button", { name: /^Next/ }).click();
      await expect(r.getByText("Progress saved")).toBeVisible({ timeout: 10_000 });
      await r.reload();
      await expect(r.getByText("4 of 28 answered")).toBeVisible();
      // Resumes on the section the rater was on.
      await expect(r.getByRole("heading", { name: "Communication" })).toBeVisible();
    }
    await rateAllSections(r, [2 + i, 3, 4]);
    await r.getByLabel(/START doing/).fill("Start delegating more of the detailed work.");
    if (i === 1) {
      // De-identification is on by default and can be previewed before submitting.
      await expect(r.getByRole("checkbox", { name: /Remove details that could identify me/ })).toBeChecked();
      await r.getByRole("button", { name: "Preview rewritten comments" }).click();
      await expect(r.getByTestId("deidentify-preview")).toContainText("Start delegating");
    }
    await r.getByRole("button", { name: /^Next/ }).click();
    await r.getByRole("button", { name: "Submit feedback" }).click();
    await expect(r.getByText("Thank you!")).toBeVisible();

    // The same link can't be used twice.
    await r.reload();
    await expect(r.getByText(/already submitted/)).toBeVisible();
    await r.close();
  }
  await phone.close();

  // Progress tracker shows 3/3, then close → report.
  await page.goto(assessmentUrl);
  await expect(page.getByText("3 of 3 responded")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("close").click();
  await page.waitForURL(/\/report$/);
  await expect(page.getByTestId("report")).toBeVisible();
  await expect(page.getByText("3 raters")).toBeVisible();
  await expect(page.getByTestId("summary-narrative")).toContainText("3 people shared feedback");
  await expect(page.getByText("Start delegating more of the detailed work.").first()).toBeVisible();
});

test("an invalid rater link shows a friendly message", async ({ page }) => {
  await page.goto("/r/this-is-not-a-real-token-at-all-0123456789abcdef");
  await expect(page.getByText("Link not recognised")).toBeVisible();
});
