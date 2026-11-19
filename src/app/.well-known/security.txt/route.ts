import { LEGAL } from "@/lib/legal";
import { appUrl } from "@/lib/url";

/** RFC 9116 security.txt. Expires one year ahead, so it never goes stale. */
export function GET() {
  const email = LEGAL.securityEmail.replace(/^\[|\]$/g, "");
  const expires = new Date(Date.now() + 365 * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const body = [`Contact: mailto:${email}`, `Expires: ${expires}`, `Policy: ${appUrl("/security#report")}`, `Canonical: ${appUrl("/.well-known/security.txt")}`, "Preferred-Languages: en", ""].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
