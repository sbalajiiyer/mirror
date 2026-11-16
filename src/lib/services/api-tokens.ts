import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { hashToken, newToken } from "@/lib/tokens";
import { hit } from "@/lib/rate-limit";

/** Personal, read-only API tokens. The token is shown once; only its hash is stored. */
export async function createApiToken(userId: string, rawName: string) {
  const name = z.string().trim().min(2, "Name the token, e.g. 'Spreadsheet'").max(40).parse(rawName);
  if ((await db.apiToken.count({ where: { userId, revokedAt: null } })) >= 10) throw new DomainError("You can have up to 10 active tokens.");
  const token = `mrr_${newToken()}`;
  const t = await db.apiToken.create({ data: { userId, name, tokenHash: hashToken(token), prefix: token.slice(0, 10) } });
  await audit(userId, "api_token.create", "ApiToken", t.id);
  return { id: t.id, token };
}

export async function listApiTokens(userId: string) {
  return db.apiToken.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true } });
}

export async function revokeApiToken(userId: string, id: string) {
  const t = await db.apiToken.findFirst({ where: { id, userId } });
  if (!t) throw new DomainError("Not found", "not_found");
  await db.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit(userId, "api_token.revoke", "ApiToken", id);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Resolve "Authorization: Bearer mrr_…" to a user id, rate-limited per token. */
export async function authenticateApi(req: Request) {
  const m = req.headers.get("authorization")?.match(/^Bearer\s+(mrr_[A-Za-z0-9_-]{40,64})$/);
  if (!m) throw new ApiError(401, "Missing or malformed bearer token");
  const t = await db.apiToken.findUnique({ where: { tokenHash: hashToken(m[1]) } });
  if (!t || t.revokedAt) throw new ApiError(401, "Invalid or revoked token");
  if (!(await hit("apiToken", t.id)).ok) throw new ApiError(429, "Rate limit exceeded (120 requests per minute)");
  if (!t.lastUsedAt || Date.now() - t.lastUsedAt.getTime() > 60_000) await db.apiToken.update({ where: { id: t.id }, data: { lastUsedAt: new Date() } });
  return t.userId;
}
