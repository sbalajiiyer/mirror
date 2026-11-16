/**
 * Public base URL for links in emails and the PDF renderer.
 * APP_URL wins; on Vercel it falls back to the deployment's own URL (production domain for
 * production, branch URL for previews), so no per-environment setting is needed.
 */
export function baseUrl(): string {
  const explicit = process.env.APP_URL || process.env.AUTH_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const vercelHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;
  return "http://localhost:3000";
}

export function appUrl(path = "/"): string {
  return `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
