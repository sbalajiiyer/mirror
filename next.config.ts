import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/binary packages used by the PDF renderer must not be bundled.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "playwright"],
  // Ship the compressed Chromium with the PDF route on Vercel.
  outputFileTracingIncludes: {
    "/api/assessments/[id]/report/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
