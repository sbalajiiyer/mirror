import { NextResponse } from "next/server";
import { hit, ipFromRequest } from "@/lib/rate-limit";
import { recordError } from "@/lib/monitoring";

/** Browser-side crashes reported by the error boundary (rate-limited, scrubbed, no user data). */
export async function POST(req: Request) {
  if (!(await hit("clientErrorIp", ipFromRequest(req))).ok) return new NextResponse(null, { status: 204 });
  const b = (await req.json().catch(() => ({}))) as { message?: string; stack?: string; path?: string };
  const e = new Error(String(b.message ?? "Client error").slice(0, 500));
  e.stack = typeof b.stack === "string" ? b.stack.slice(0, 3000) : undefined;
  await recordError(e, { route: typeof b.path === "string" ? b.path.split("?")[0].slice(0, 200) : null, kind: "client" });
  return new NextResponse(null, { status: 204 });
}
