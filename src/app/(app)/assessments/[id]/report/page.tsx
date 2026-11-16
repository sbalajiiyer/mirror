import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getReportForOwner } from "@/lib/services/reports";
import { requireUserId } from "@/lib/session";
import { ReportView } from "@/components/report/report-view";
import { sessionInfo } from "@/lib/services/sessions";
import { brandingForClient } from "@/lib/services/coach";
import { benchmarkForReport } from "@/lib/services/benchmarks";
import { BenchmarkCard } from "@/components/report/benchmark-card";
import { db } from "@/lib/db";

export const metadata = { title: "Report" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId(`/assessments/${id}/report`);
  const r = await getReportForOwner(userId, id);
  if (r.status === "not_found") notFound();
  if (r.status === "not_closed") redirect(`/assessments/${id}`);
  const profile = await db.subjectProfile.findUnique({ where: { userId } });
  const bench = r.report.anonymity.available ? await benchmarkForReport(r.report, profile?.seniority) : null;
  return (
    <div>
      <Link href="/dashboard" className="no-print text-sm text-muted-foreground hover:underline">
        ← My 360s
      </Link>
      <div className="mt-2">
        <ReportView report={r.report} aiSummary={r.aiSummary} session={await sessionInfo(id)} branding={await brandingForClient(userId)} generatedAt={r.generatedAt.toISOString()} pdfUrl={`/api/assessments/${id}/report/pdf`} />
      </div>
      {bench?.available && (
        <div className="mt-6">
          <BenchmarkCard rows={bench.rows} people={bench.people} />
        </div>
      )}
    </div>
  );
}
