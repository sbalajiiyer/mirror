/**
 * Rule-based removal of obvious identifiers. Always applied before any text leaves the
 * server for an AI provider, and used as the fallback when AI de-identification fails.
 */
export function scrubIdentifiers(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\+?\(?\d[\d\s().-]{6,}\d/g, "[phone]")
    .replace(/(^|\s)@[A-Za-z0-9_]{2,}/g, "$1[handle]");
}
