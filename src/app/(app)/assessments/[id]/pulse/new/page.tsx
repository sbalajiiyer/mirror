import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { defaultPulseQuestions } from "@/lib/progress";
import { getReportForOwner } from "@/lib/services/reports";
import { seriesRootId } from "@/lib/services/pulses";
import { requireUserId } from "@/lib/session";
import { PulseForm } from "./pulse-form";

export const metadata = { title: "New pulse check" };

export default async function NewPulsePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId(`/assessments/${id}/pulse/new`);
  const r = await getReportForOwner(userId, id);
  if (r.status === "not_found") notFound();
  if (r.status === "not_closed") redirect(`/assessments/${id}`);
  const a = await db.assessment.findUniqueOrThrow({
    where: { id },
    include: { raterGroups: { include: { invites: { where: { email: { not: null }, status: { not: "DECLINED" } }, select: { id: true } } } } },
  });
  const root = await db.assessment.findUniqueOrThrow({ where: { id: seriesRootId(a) } });
  const goals = await db.goal.findMany({ where: { userId, assessmentId: root.id, status: "ACTIVE" } });
  const report = r.report;
  const defaults = report.anonymity.available ? defaultPulseQuestions(report, goals.map((g) => g.competencyKey)) : [];
  const raterCount = a.raterGroups.reduce((s, g) => s + g.invites.length, 0);
  const competencies = report.competencies.map((c) => ({
    key: c.key,
    name: c.name,
    questions: report.questions.filter((q) => q.competencyKey === c.key).map((q) => ({ id: q.id, text: q.text, others: q.others.mean })),
  }));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/assessments/${id}/report`} className="text-sm text-muted-foreground hover:underline">
          ← Back to report
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Start a pulse check</h1>
        <p className="text-muted-foreground">
          A short (5–10 statement) re-check with the same people, so you can see whether things are changing. Results appear on your Progress page next to “{root.title}”.
        </p>
      </div>
      {!report.anonymity.available ? (
        <p className="text-muted-foreground">This 360 didn&apos;t get enough responses to compare against.</p>
      ) : (
        <PulseForm sourceId={id} competencies={competencies} defaults={defaults} raterCount={raterCount} cadence={root.cadenceMonths ?? 0} />
      )}
    </div>
  );
}
