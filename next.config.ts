import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/binary packages used by the PDF renderer must not be bundled.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "playwright"],
  outputFileTracingIncludes: {
    // Prisma's Wasm query compiler (engineType = "client") is loaded from disk at runtime,
    // so file tracing doesn't see it. Ship it with every server function.
    "/**": ["./node_modules/.prisma/client/*.wasm", "./node_modules/.prisma/client/*.mjs"],
    // Compressed Chromium for the PDF route on Vercel.
    "/api/assessments/[id]/report/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
