export type Rater = { name: string; email: string };
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse pasted lines like "Sam Patel <sam@x.com>", "sam@x.com" or "Sam Patel, sam@x.com". */
export function parseRaterLines(text: string): Rater[] {
  return text
    .split(/[\n;]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const email = line.match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/)?.[0] ?? "";
      const name = line.replace(email, "").replace(/[<>,"]/g, " ").replace(/\s+/g, " ").trim();
      return { name, email: email.toLowerCase() };
    })
    .filter((r) => EMAIL_RE.test(r.email));
}
