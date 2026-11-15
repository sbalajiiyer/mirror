import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getReportForOwner } from "@/lib/services/reports";

/** JSON report for the owner. Same anonymised payload the UI renders; never raw responses. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await getReportForOwner(userId, id);
  if (r.status === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (r.status === "not_closed") return NextResponse.json({ error: "not_closed", status: r.assessmentStatus }, { status: 409 });
  return NextResponse.json({ generatedAt: r.generatedAt, report: r.report }, { headers: { "Cache-Control": "private, no-store" } });
}
