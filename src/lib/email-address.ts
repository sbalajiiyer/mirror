/**
 * Normalise an email address before it is used to sign in or look up an account.
 * Unicode is normalised first (NFKC turns look-alikes such as a full-width "＠" into "@"), then the
 * address must be plain ASCII with exactly one "@". Returns null if it isn't a usable address.
 */
export function normalizeEmail(raw: string): string | null {
  const e = raw.normalize("NFKC").trim().toLowerCase();
  if (e.length > 254 || !/^[\x21-\x7e]+$/.test(e)) return null;
  const parts = e.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || domain.includes("..")) return null;
  return e;
}
