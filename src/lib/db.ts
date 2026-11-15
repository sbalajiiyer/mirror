import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pgConfigFromUrl } from "./pg-config";

// Prisma client using the node-postgres driver adapter (engineType = "client"): no native
// query engine, works on serverless hosts and with Neon/Supabase connection strings.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return new PrismaClient({ adapter: new PrismaPg(pgConfigFromUrl(url)) });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
