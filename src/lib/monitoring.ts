import { createHash } from "node:crypto";
import { db } from "@/lib/db";

/*
 * Built-in error monitoring: server errors are grouped by fingerprint (message + top stack frame) in
 * the ErrorEvent table, with a count and first/last seen. No third-party service, no personal data:
 * messages are scrubbed of emails and long tokens before they are stored.
 */

const scrub = (s: string) =>
  s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[token]")
    .replace(/(postgres(ql)?:\/\/)[^\s"']+/gi, "$1[redacted]");

export function fingerprint(message: string, stack?: string | null, route?: string | null) {
  const frame = (stack ?? "").split("\n").find((l) => l.trim().startsWith("at ")) ?? "";
  // Ids (long tokens with digits) and numbers vary between occurrences of the same error.
  const normalized = message.replace(/\b(?=\w*\d)\w{8,}\b/g, "#").replace(/\d+/g, "#");
  return createHash("sha256").update(`${normalized}|${frame.trim()}|${route ?? ""}`).digest("hex").slice(0, 32);
}

export async function recordError(err: unknown, ctx: { route?: string | null; kind?: "server" | "client" | "job" } = {}) {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    // Framework control flow (redirect / notFound) is not an error.
    const digest = (e as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) return;
    const message = scrub(e.message || e.name || "Unknown error").slice(0, 500);
    const stack = e.stack ? scrub(e.stack).split("\n").slice(0, 12).join("\n").slice(0, 3000) : null;
    const route = ctx.route ? ctx.route.slice(0, 200) : null;
    const fp = fingerprint(message, stack, route);
    await db.errorEvent.upsert({
      where: { fingerprint: fp },
      create: { fingerprint: fp, message, stack, route, kind: ctx.kind ?? "server" },
      update: { count: { increment: 1 }, lastSeen: new Date(), resolvedAt: null, stack },
    });
  } catch (inner) {
    console.error("[monitoring] could not record error", inner);
  }
}

export function isPlatformAdmin(email: string | null | undefined) {
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

export async function pruneErrors(olderThanDays = 90) {
  return (await db.errorEvent.deleteMany({ where: { lastSeen: { lt: new Date(Date.now() - olderThanDays * 86400000) } } })).count;
}
