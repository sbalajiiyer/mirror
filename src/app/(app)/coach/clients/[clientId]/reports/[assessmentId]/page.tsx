import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { DomainError } from "@/lib/errors";
import { coachReport } from "@/lib/services/coach";
import { ReportView } from "@/components/report/report-view";
import { Alert } from "@/components/ui/alert";

export const metadata = { title: "Shared report", robots: { index: false } };

export default async function SharedReport({ params }: { params: Promise<{ clientId: string; assessmentId: string }> }) {
  const { clientId, assessmentId } = await params;
  const user = await requireOnboardedUser(`/coach/clients/${clientId}/reports/${assessmentId}`);
  let r: Awaited<ReturnType<typeof coachReport>>;
  try {
    r = await coachReport(user.id, clientId, assessmentId);
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
  return (
    <div className="space-y-4">
      <Link href={`/coach/clients/${clientId}`} className="no-print inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to client
      </Link>
      <Alert tone="info" className="no-print flex items-center gap-2">
        <Eye className="size-4 shrink-0" aria-hidden /> You&apos;re viewing a report {r.report.assessment.subjectFirstName} shared with you. It&apos;s read-only, and access ends
        if they stop sharing.
      </Alert>
      <ReportView report={r.report} generatedAt={r.generatedAt.toISOString()} mode="coach" session={r.session} />
    </div>
  );
}
