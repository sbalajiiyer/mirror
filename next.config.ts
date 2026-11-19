import type { NextConfig } from "next";

/**
 * Security headers on every response (see /security). HTTPS and HSTS come from Vercel.
 * No full script CSP yet: Next.js inline bootstrap scripts would need nonces first.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  // Rater and share links carry tokens in the path: never send the path to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Rater and share pages: send no referrer at all.
      { source: "/r/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/s/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  // Questionnaire imports are capped at 1 MB in code; leave room for multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // Native/binary packages used by the PDF renderer must not be bundled.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "playwright"],
  outputFileTracingIncludes: {
    // Compressed Chromium for the PDF route on Vercel.
    // playwright-core reads browsers.json/package.json at runtime, which tracing misses.
    "/api/assessments/[id]/report/pdf": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/playwright-core/**"],
    "/api/health": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/playwright-core/**"],
  },
};

export default nextConfig;
