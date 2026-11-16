import Link from "next/link";
import { db } from "@/lib/db";
import { goalProgress, streak, toSeriesPoint, type SeriesPoint } from "@/lib/progress";
import type { ReportData } from "@/lib/report/compute";
import { markAchieved } from "@/lib/services/goals";
import { requireOnboardedUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressView } from "@/components/progress/progress-view";

export const metadata = { title: "Progress" };

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ series?: string }> }) {
  const user = await requireOnboardedUser("/progress");
  const { series } = await searchParams;
  const roots = await db.assessment.findMany({
    where: { subjectId: user.id, rootAssessmentId: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, cadenceMonths: true, nextPulseDueAt: true, createdAt: true },
  });
  const root = roots.find((r) => r.id === series) ?? roots.find((r) => r.status === "CLOSED") ?? roots[0];

  if (!root) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>No progress to show yet</CardTitle>
          <CardDescription>Run a 360 first; then short pulse checks show how you&apos;re changing over time.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/assessments/new">Set up a 360</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const members = await db.assessment.findMany({
    where: { OR: [{ id: root.id }, { rootAssessmentId: root.id }] },
    orderBy: { createdAt: "asc" },
    include: { reports: { orderBy: { generatedAt: "desc" }, take: 1 } },
  });
  const points: SeriesPoint[] = [];
  for (const m of members) {
    if (m.status !== "CLOSED" || !m.closedAt || !m.reports[0]) continue;
    const p = toSeriesPoint({ id: m.id, title: m.title, type: m.type, closedAt: m.closedAt }, m.reports[0].data as unknown as ReportData);
    if (p) points.push(p);
  }
  const inProgress = members.filter((m) => m.status !== "CLOSED").map((m) => ({ id: m.id, title: m.title, status: m.status }));
  const latestClosed = [...members].filter((m) => m.status === "CLOSED").sort((a, b) => +b.closedAt! - +a.closedAt!)[0];

  const goals = await db.goal.findMany({ where: { userId: user.id, assessmentId: root.id, status: { not: "ARCHIVED" } }, orderBy: { createdAt: "asc" } });
  const goalViews = [];
  for (const g of goals) {
    const gp = goalProgress(g, points);
    if (gp.achieved && g.status === "ACTIVE") await markAchieved(g.id, gp.latestDate ? new Date(gp.latestDate) : new Date());
    goalViews.push({
      id: g.id,
      title: g.title,
      competencyKey: g.competencyKey,
      competencyName: g.competencyName,
      baseline: g.baseline,
      target: g.target,
      status: gp.achieved ? "ACHIEVED" : g.status,
      ...gp,
    });
  }
  const pulseDates = members.filter((m) => m.type === "PULSE" && m.closedAt).map((m) => m.closedAt!);
  const st = streak(pulseDates, root.cadenceMonths);
  const scaleMax = members[0]?.scaleMax ?? 5;

  return (
    <ProgressView
      seriesList={roots.map((r) => ({ id: r.id, title: r.title }))}
      root={{ id: root.id, title: root.title, cadenceMonths: root.cadenceMonths, nextPulseDueAt: root.nextPulseDueAt?.toISOString() ?? null }}
      points={points}
      goals={goalViews}
      streak={{ ...st, pulses: pulseDates.length }}
      inProgress={inProgress}
      latestClosedId={latestClosed?.id ?? null}
      scaleMax={scaleMax}
    />
  );
}
