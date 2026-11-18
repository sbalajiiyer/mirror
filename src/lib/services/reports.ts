import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { contributeToRound } from "@/lib/services/round-results";
import type { StoredAIThemes } from "@/lib/services/ai-themes";
import { computeReport, type ReportData, type ReportInput } from "@/lib/report/compute";
import { firstName } from "@/lib/utils";
import type { StoredAISummary } from "@/lib/services/ai";

export async function loadReportInput(assessmentId: string): Promise<ReportInput> {
  const a = await db.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    include: {
      subject: { include: { profile: true } },
      questions: true,
      raterGroups: { include: { _count: { select: { invites: true } } } },
      submissions: { include: { responses: true, comments: true } },
    },
  });
  const name = firstName(a.subject.profile?.displayName ?? a.subject.name);
  return {
    assessment: {
      id: a.id,
      title: a.title,
      goal: a.goal,
      scaleMax: a.scaleMax,
      minRatersPerGroup: a.minRatersPerGroup,
      subjectFirstName: name,
    },
    groups: a.raterGroups.map((g) => ({ id: g.id, kind: g.kind, name: g.name, order: g.order })),
    invited: Object.fromEntries(a.raterGroups.map((g) => [g.id, g._count.invites])),
    questions: a.questions.map((q) => ({
      id: q.id,
      competencyKey: q.competencyKey,
      competency: q.competency,
      questionKey: q.questionKey,
      text: q.text.replaceAll("{name}", name),
      order: q.order,
      type: q.type,
    })),
    submissions: a.submissions.map((s) => ({
      id: s.id,
      groupId: s.raterGroupId,
      isSelf: s.isSelf,
      responses: s.responses.map((r) => ({ questionId: r.assessmentQuestionId, value: r.value })),
      comments: s.comments.map((c) => ({ kind: c.kind, competencyKey: c.competencyKey, text: c.text })),
    })),
  };
}

export async function buildAndStoreReport(assessmentId: string) {
  const data = computeReport(await loadReportInput(assessmentId));
  const report = await db.report.create({ data: { assessmentId, data: data as unknown as Prisma.InputJsonValue } });
  // Company round 360s also add to the round's frozen, anonymous totals (Phase 11).
  await contributeToRound(assessmentId, data);
  return report;
}

/**
 * The only way report data leaves the server. Returns the frozen report for a CLOSED
 * assessment owned by `userId`; nothing while feedback is still being collected.
 */
export async function getReportForOwner(userId: string, assessmentId: string): Promise<
  | { status: "not_found" }
  | { status: "not_closed"; assessmentStatus: string }
  | { status: "ok"; report: ReportData; generatedAt: Date; aiSummary: StoredAISummary | null; aiThemes: StoredAIThemes | null }
> {
  const a = await db.assessment.findFirst({
    where: { id: assessmentId, subjectId: userId },
    include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } },
  });
  if (!a) return { status: "not_found" };
  if (a.status !== "CLOSED") return { status: "not_closed", assessmentStatus: a.status };
  const r = a.reports[0] ?? (await buildAndStoreReport(a.id));
  return {
    status: "ok",
    report: r.data as unknown as ReportData,
    generatedAt: r.generatedAt,
    aiSummary: (r.aiSummary as unknown as StoredAISummary | null) ?? null,
    aiThemes: ((r as { aiThemes?: unknown }).aiThemes as StoredAIThemes | null) ?? null,
  };
}
