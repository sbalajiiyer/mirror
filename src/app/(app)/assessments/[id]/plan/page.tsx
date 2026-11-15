import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getReportForOwner } from "@/lib/services/reports";
import { latestPlan } from "@/lib/services/ai";
import { requireUserId } from "@/lib/session";
import { PlanView, CreatePlan } from "./plan-view";

export const metadata = { title: "Development plan" };

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId(`/assessments/${id}/plan`);
  const r = await getReportForOwner(userId, id);
  if (r.status === "not_found") notFound();
  if (r.status === "not_closed") redirect(`/assessments/${id}`);
  const [plan, profile] = await Promise.all([latestPlan(userId, id), db.subjectProfile.findUnique({ where: { userId } })]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/assessments/${id}/report`} className="text-sm text-muted-foreground hover:underline">
          ← Back to report
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your development plan</h1>
        <p className="text-muted-foreground">{r.report.assessment.title}</p>
      </div>
      {!r.report.anonymity.available ? (
        <p className="text-muted-foreground">A plan needs enough responses to show results first.</p>
      ) : plan ? (
        <PlanView assessmentId={id} planId={plan.id} plan={plan.data} createdAt={plan.createdAt.toISOString()} learningStyle={profile?.learningStyle ?? null} />
      ) : (
        <CreatePlan assessmentId={id} learningStyle={profile?.learningStyle ?? null} />
      )}
    </div>
  );
}
