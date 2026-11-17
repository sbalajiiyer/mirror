import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { ReportData } from "@/lib/report/compute";
import type { ThemeGroup } from "@/lib/text/themes";
import { sentimentOf } from "@/lib/text/themes";
import { groupCommentsWithAI } from "@/lib/ai/features/themes";
import { regionForAssessment } from "@/lib/services/residency";

export type StoredAIThemes = { themes: (ThemeGroup & { summary: string })[]; modelId: string; generatedBy: string; generatedAt: string };

const SENT = { positive: 0.6, mixed: 0, constructive: -0.6 } as const;

/** Re-group a closed report's written comments by meaning with AI; stored next to the keyword themes. */
export async function createAIThemes(userId: string, assessmentId: string) {
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId, status: "CLOSED" }, include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 }, subject: { include: { profile: true } } } });
  const report = a?.reports[0];
  const data = report?.data as unknown as (ReportData & { retentionPurgedAt?: string }) | undefined;
  if (!a || !report || !data?.anonymity.available) throw new DomainError("The report isn't ready yet.", "not_ready");
  if (data.retentionPurgedAt) throw new DomainError("Written comments for this 360 were deleted under your organization's retention policy.");
  // Every written comment: general ones, Start/Stop/Continue suggestions and per-competency notes.
  const label = { START: "Start", STOP: "Stop", CONTINUE: "Continue" } as const;
  const comments = [
    ...data.comments.themes.flatMap((t) => t.comments),
    ...(["START", "STOP", "CONTINUE"] as const).flatMap((k) => data.comments.ssc[k].flatMap((t) => t.comments.map((c) => ({ ...c, group: `${c.group} · ${label[k]}` })))),
    ...Object.values(data.comments.competency).flatMap((cs) => cs.map((c) => ({ ...c, sentiment: sentimentOf(c.text).label }))),
  ];
  if (comments.length < 3) throw new DomainError("There aren't enough written comments to group.");
  const res = await groupCommentsWithAI(
    comments.map((c) => c.text),
    { userId, subjectFirstName: data.assessment.subjectFirstName, modelChoice: a.subject.profile?.aiModel, region: await regionForAssessment(a.id) },
  );
  if (!res.ok) throw new DomainError(res.error.includes("limit") ? res.error : `${res.error.replace(/, so a standard version was used\.?/, ".")} Keyword themes are still shown.`, "ai_unavailable");
  const seen = new Set<number>();
  const themes = res.data.themes
    .map((t, k) => {
      const items = t.items.filter((i) => i < comments.length && !seen.has(i) && (seen.add(i), true)).map((i) => ({ ...comments[i], sentiment: comments[i].sentiment ?? sentimentOf(comments[i].text).label }));
      return { key: `ai-${k}`, label: t.label, summary: t.summary, count: items.length, sentiment: SENT[t.sentiment], comments: items };
    })
    .filter((t) => t.count > 0);
  const missed = comments.filter((_, i) => !seen.has(i));
  if (missed.length) themes.push({ key: "ai-other", label: "Other", summary: "Comments that didn't fit a theme.", count: missed.length, sentiment: 0, comments: missed });
  const stored: StoredAIThemes = { themes, modelId: res.modelId, generatedBy: res.generatedBy, generatedAt: new Date().toISOString() };
  await db.report.update({ where: { id: report.id }, data: { aiThemes: stored as unknown as Prisma.InputJsonValue } });
  await audit(userId, "ai.themes", "Assessment", a.id, { themes: themes.length });
  return stored;
}
