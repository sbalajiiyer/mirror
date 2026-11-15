import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { pgConfigFromUrl } from "./src/lib/pg-config";

// Migrations run through the JS/Wasm schema engine + node-postgres driver adapter, so no
// native Prisma engine binaries are downloaded (works in locked-down CI and serverless).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  experimental: { adapter: true },
  engine: "js",
  // Discrete fields (not connectionString) so the adapter's shadow database gets its own name.
  adapter: async () => new PrismaPg(pgConfigFromUrl(process.env.DATABASE_URL!)),
});
