import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    fileParallelism: false,
    environment: "node",
    alias: { "server-only": new URL("./tests/unit/server-only-stub.ts", import.meta.url).pathname },
    env: {
      AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
      EMAIL_PROVIDER: "console",
      BILLING_ENFORCED: "false", // billing tests turn it on explicitly
      AI_PROVIDER: "", // tests choose providers explicitly; ignore any local .env setting
      // Integration tests run only when TEST_DATABASE_URL points at a disposable database.
      ...(process.env.TEST_DATABASE_URL ? { DATABASE_URL: process.env.TEST_DATABASE_URL } : {}),
    },
  },
});
