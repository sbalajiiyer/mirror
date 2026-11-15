import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 256-bit random token for rater links. Only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Rater-link token for an invite (or group share link). Derived with HMAC from the record
 * id and AUTH_SECRET, so it can be re-created for reminders without being stored; the
 * database only keeps sha256(token). Rotating AUTH_SECRET invalidates outstanding links.
 */
export function derivedToken(purpose: "invite" | "group", id: string): string {
  return createHmac("sha256", secret()).update(`mirror:${purpose}:${id}`).digest("base64url");
}

/** Rough shape check before touching the database. */
export function looksLikeToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(token);
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

/** Short-lived signed token, e.g. so the PDF renderer can open the print view. */
export function signPayload(payload: string, ttlSeconds: number, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const body = `${payload}.${exp}`;
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return Buffer.from(`${body}.${sig}`).toString("base64url");
}

export function verifySignedPayload(token: string, now = Date.now()): string | null {
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString();
  } catch {
    return null;
  }
  const parts = decoded.split(".");
  if (parts.length < 3) return null;
  const sig = parts.pop()!;
  const exp = Number(parts.pop());
  const payload = parts.join(".");
  const expected = createHmac("sha256", secret()).update(`${payload}.${exp}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!Number.isFinite(exp) || exp * 1000 < now) return null;
  return payload;
}
