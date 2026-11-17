import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Questionnaire imports are capped at 1 MB in code; leave room for multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // Native/binary packages used by the PDF renderer must not be bundled.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "playwright"],
  outputFileTracingIncludes: {
    // Compressed Chromium for the PDF route on Vercel.
    "/api/assessments/[id]/report/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
