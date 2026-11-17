import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a production build with the seeded demo data:
 *   npm run build && npm run db:seed && npm run test:e2e
 * Requires DEMO_LOGIN_ENABLED=true and DEV_TOOLS_ENABLED=true (rater links are read from /dev/outbox).
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: "http://localhost:3000/signin", reuseExistingServer: true, timeout: 120_000 },
});
