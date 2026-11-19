import { expect, test } from "@playwright/test";
import { demoLogin, expectAccessible } from "./helpers";

test("security page, DPA and security.txt are public and linked", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("contentinfo").getByRole("link", { name: "Security" }).click();
  await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
  await expect(page.getByText("doesn't have SOC 2 or ISO 27001 certification yet")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reporting a vulnerability" })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: "data processing agreement" }).click();
  await expect(page.getByRole("heading", { name: "Data processing agreement", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "3. Sub-processors" })).toBeVisible();
  await expectAccessible(page);
  const txt = await page.request.get("/.well-known/security.txt");
  expect(txt.status()).toBe(200);
  const body = await txt.text();
  expect(body).toMatch(/^Contact: mailto:/m);
  expect(body).toMatch(/^Expires: \d{4}-\d\d-\d\dT/m);
});

test("security headers on every response; rater links send no referrer", async ({ page }) => {
  const res = await page.request.get("/signin");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  const rater = await page.request.get(`/r/not-a-real-${"x".repeat(40)}`, { headers: { "x-forwarded-for": "203.0.113.77" } });
  expect(rater.headers()["referrer-policy"]).toBe("no-referrer");
});

test("platform admin sees anonymous funnel totals", async ({ page }) => {
  test.skip(!(process.env.PLATFORM_ADMIN_EMAILS ?? "").includes("demo@mirror.local"), "needs PLATFORM_ADMIN_EMAILS=demo@mirror.local");
  await demoLogin(page);
  await page.goto("/admin/funnel?w=all&test=1");
  await expect(page.getByRole("heading", { name: "Funnel", exact: true })).toBeVisible();
  await expect(page.getByTestId("subject-funnel").getByTestId("step-signed_up")).toBeVisible();
  await expect(page.getByTestId("rater-funnel").getByTestId("step-submitted")).toBeVisible();
  // Totals only: no emails anywhere on the page.
  await expect(page.getByTestId("subject-funnel")).not.toContainText("@");
  await page.getByRole("link", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/w=7/);
  await expectAccessible(page);
});
