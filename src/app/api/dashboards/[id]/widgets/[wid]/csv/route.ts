import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { DomainError } from "@/lib/errors";
import { getDashboard, renderWidgets } from "@/lib/services/dashboards";
import { toCsv } from "@/lib/dashboards/widgets";

export const runtime = "nodejs";

/** CSV download of one widget (signed-in owner only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; wid: string }> }) {
  const userId = (await auth())?.user?.id;
  if (!userId) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { id, wid } = await params;
  try {
    const d = await getDashboard(userId, id);
    const [r] = await renderWidgets(d, wid);
    if (!r?.data) return NextResponse.json({ error: r?.error ?? "Not found" }, { status: 404 });
    const name = r.data.title.replace(/[^\w-]+/g, "-").toLowerCase();
    return new NextResponse(toCsv(r.data), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
