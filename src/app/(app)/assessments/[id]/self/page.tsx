import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOwnedAssessment } from "@/lib/session";
import { SelfForm } from "./self-form";

export const metadata = { title: "Self-assessment" };

export default async function SelfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { assessment } = await requireOwnedAssessment(id);
  if (assessment.selfLockedAt) redirect(`/assessments/${id}`);
  const qs = await db.assessmentQuestion.findMany({ where: { assessmentId: id, type: "RATING" }, orderBy: { order: "asc" } });
  const comps = new Map<string, { key: string; name: string; questions: { id: string; text: string }[] }>();
  for (const q of qs) {
    if (!comps.has(q.competencyKey)) comps.set(q.competencyKey, { key: q.competencyKey, name: q.competency, questions: [] });
    comps.get(q.competencyKey)!.questions.push({ id: q.id, text: q.selfText });
  }
  return (
    <div className="mx-auto max-w-xl">
      <SelfForm assessmentId={id} competencies={[...comps.values()]} scaleMax={assessment.scaleMax} />
    </div>
  );
}
