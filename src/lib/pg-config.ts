import type { PoolConfig } from "pg";

/** Turn a postgres:// URL into discrete node-postgres options. */
export function pgConfigFromUrl(url: string): PoolConfig {
  const u = new URL(url);
  const sslmode = u.searchParams.get("sslmode");
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    ssl: sslmode && sslmode !== "disable" ? { rejectUnauthorized: sslmode === "verify-full" } : undefined,
    options: u.searchParams.get("options") ?? undefined,
  };
}
