import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getPdfRenderer } from "@/lib/pdf";
import { signPayload } from "@/lib/tokens";
import { appUrl } from "@/lib/url";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const a = await db.assessment.findFirst({ where: { id, subjectId: userId }, select: { status: true, title: true } });
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (a.status !== "CLOSED") return NextResponse.json({ error: "not_closed" }, { status: 409 });
  const token = signPayload(`print:${id}:${userId}`, 120);
  try {
    const pdf = await getPdfRenderer().render(appUrl(`/print/report/${id}?t=${encodeURIComponent(token)}`));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${a.title.replace(/[^\w-]+/g, "-")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[pdf] render failed", err);
    return NextResponse.json({ error: "pdf_unavailable" }, { status: 503 });
  }
}
