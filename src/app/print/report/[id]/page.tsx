import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getReportForOwner } from "@/lib/services/reports";
import { verifySignedPayload } from "@/lib/tokens";
import { ReportView } from "@/components/report/report-view";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

/**
 * Print view used by the PDF renderer. Access: the owner's session, or a short-lived signed
 * token (HMAC with AUTH_SECRET, 2 minutes) minted by the PDF route for this assessment only.
 */
export default async function PrintReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t } = await searchParams;
  let ownerId: string | null = null;
  const payload = t ? verifySignedPayload(t) : null;
  if (payload?.startsWith(`print:${id}:`)) ownerId = payload.split(":")[2];
  if (!ownerId) ownerId = (await auth())?.user?.id ?? null;
  if (!ownerId) notFound();
  const owns = await db.assessment.count({ where: { id, subjectId: ownerId } });
  if (!owns) notFound();
  const r = await getReportForOwner(ownerId, id);
  if (r.status !== "ok") notFound();
  return (
    <main className="mx-auto max-w-[1000px] p-6">
      <ReportView report={r.report} generatedAt={r.generatedAt.toISOString()} print />
    </main>
  );
}
