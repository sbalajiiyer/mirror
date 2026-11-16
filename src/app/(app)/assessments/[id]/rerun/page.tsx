import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwnedAssessment } from "@/lib/session";
import { seriesRootId } from "@/lib/services/sessions";
import { surveyCode } from "@/lib/survey";
import { Alert } from "@/components/ui/alert";
import { RerunForm } from "./rerun-form";

export const metadata = { title: "Run survey again" };

export default async function RerunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { assessment } = await requireOwnedAssessment(id);
  const rootId = seriesRootId(assessment);
  const root = await db.assessment.findUnique({ where: { id: rootId }, include: { _count: { select: { questions: true } } } });
  if (!root) notFound();
  const [sessions, raters, open] = await Promise.all([
    db.assessment.findMany({ where: { OR: [{ id: rootId }, { rootAssessmentId: rootId }] }, select: { sessionNumber: true } }),
    db.raterInvite.count({ where: { assessmentId: id, email: { not: null }, status: { not: "DECLINED" } } }),
    db.assessment.count({ where: { OR: [{ id: rootId }, { rootAssessmentId: rootId }], status: { in: ["DRAFT", "READY", "COLLECTING"] } } }),
  ]);
  const next = Math.max(...sessions.map((s) => s.sessionNumber)) + 1;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← My 360s
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Run “{root.title}” again</h1>
        <p className="text-muted-foreground">
          Survey <span className="font-mono">{surveyCode(rootId)}</span> · this will be <strong>session {next}</strong>. It uses exactly the same {root._count.questions} statements as session 1, so every statement can be compared on your Progress page.
        </p>
      </div>
      {assessment.status !== "CLOSED" ? (
        <Alert tone="warning">Close this session before running the survey again.</Alert>
      ) : open > 0 ? (
        <Alert tone="warning">This survey already has a session in progress. Finish or close it first.</Alert>
      ) : (
        <RerunForm sourceId={id} raterCount={raters} defaultLabel={new Date().toLocaleDateString("en", { month: "long", year: "numeric" })} />
      )}
    </div>
  );
}
