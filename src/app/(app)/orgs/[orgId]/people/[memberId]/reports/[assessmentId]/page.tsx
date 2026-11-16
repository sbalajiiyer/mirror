import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { adminPage, or404 } from "@/lib/org/page-guard";
import { adminMemberReport } from "@/lib/services/org";
import { ReportView } from "@/components/report/report-view";
import { Alert } from "@/components/ui/alert";

export const metadata = { title: "Shared report", robots: { index: false } };

export default async function OrgSharedReport({ params }: { params: Promise<{ orgId: string; memberId: string; assessmentId: string }> }) {
  const { orgId, memberId, assessmentId } = await params;
  const { user } = await adminPage(orgId, `/people/${memberId}/reports/${assessmentId}`);
  const r = await or404(adminMemberReport(user.id, orgId, memberId, assessmentId));
  return (
    <div className="space-y-4">
      <Link href={`/orgs/${orgId}/people/${memberId}`} className="no-print inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {r.memberName}
      </Link>
      <Alert tone="info" className="no-print flex items-center gap-2">
        <Eye className="size-4 shrink-0" aria-hidden /> {r.memberName} chose to share this report with the organization. It&apos;s read-only and leaves out raters&apos; comments.
      </Alert>
      <ReportView report={r.report} generatedAt={r.generatedAt.toISOString()} mode="coach" session={r.session} />
    </div>
  );
}
