import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7: the connection URL for migrations lives here. Migrations prefer a direct (non-pooled)
// connection when one is configured, e.g. Neon's host without "-pooler". The app itself connects
// through the node-postgres driver adapter (src/lib/db.ts), so no query engine binary is used.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || "",
  },
});
