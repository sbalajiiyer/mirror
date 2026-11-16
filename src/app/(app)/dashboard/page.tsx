import Link from "next/link";
import { Activity, Plus, Repeat, TrendingUp } from "lucide-react";
import type { AssessmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { goalLabel } from "@/lib/constants";
import { requireOnboardedUser } from "@/lib/session";
import { sessionKind, surveyCode } from "@/lib/survey";
import { StatusBadge } from "@/components/assessment/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "My 360s" };

const OPEN: AssessmentStatus[] = ["DRAFT", "READY", "COLLECTING"];

export default async function Dashboard() {
  const user = await requireOnboardedUser("/dashboard");
  const assessments = await db.assessment.findMany({
    where: { subjectId: user.id },
    orderBy: [{ sessionNumber: "desc" }, { createdAt: "desc" }],
    include: { invites: { select: { status: true } } },
  });

  // A survey = the original 360 (root) + all its later sessions.
  const surveys = new Map<string, typeof assessments>();
  for (const a of assessments) {
    const root = a.rootAssessmentId ?? a.id;
    surveys.set(root, [...(surveys.get(root) ?? []), a]);
  }
  const list = [...surveys.entries()]
    .map(([rootId, sessions]) => ({ rootId, root: sessions.find((s) => s.id === rootId) ?? sessions[sessions.length - 1], sessions }))
    .sort((a, b) => +b.sessions[0].createdAt - +a.sessions[0].createdAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hi {user.profile.displayName.split(" ")[0]}</h1>
          <p className="text-muted-foreground">Your surveys and every session you&apos;ve run of them.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/progress">Progress</Link>
          </Button>
          <Button asChild>
            <Link href="/assessments/new">
              <Plus /> New 360
            </Link>
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Start your first 360</CardTitle>
            <CardDescription>It takes about 5 minutes to set up. You&apos;ll rate yourself first, then invite the people around you.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/assessments/new">Set up a 360</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {list.map(({ rootId, root, sessions }) => {
            const latestClosed = sessions.find((s) => s.status === "CLOSED");
            const hasOpen = sessions.some((s) => OPEN.includes(s.status));
            return (
              <Card key={rootId} data-testid="survey">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base leading-snug">
                        <Link className="hover:underline" href={latestClosed ? `/assessments/${latestClosed.id}/report` : `/assessments/${sessions[0].id}`}>
                          {root.title}
                        </Link>
                      </CardTitle>
                      <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono" title="Survey ID">
                          {surveyCode(rootId)}
                        </Badge>
                        <span>Goal: {goalLabel(root.goal)}</span>
                        <span>
                          · {sessions.length} session{sessions.length === 1 ? "" : "s"}
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {latestClosed && !hasOpen && (
                        <>
                          <Button asChild size="sm" variant="secondary">
                            <Link href={`/assessments/${latestClosed.id}/rerun`}>
                              <Repeat /> Run again
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/assessments/${latestClosed.id}/pulse/new`}>
                              <Activity /> Pulse check
                            </Link>
                          </Button>
                        </>
                      )}
                      {sessions.filter((s) => s.status === "CLOSED").length > 0 && (
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/progress?series=${rootId}`}>
                            <TrendingUp /> Trends
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y rounded-lg border">
                    {sessions.map((s) => {
                      const total = s.invites.length;
                      const done = s.invites.filter((i) => i.status === "SUBMITTED").length;
                      return (
                        <li key={s.id}>
                          <Link
                            href={s.status === "CLOSED" ? `/assessments/${s.id}/report` : `/assessments/${s.id}`}
                            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent/50 sm:grid-cols-[auto_1fr_10rem_auto]"
                            data-testid="session-row"
                          >
                            <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold" title={`Session ${s.sessionNumber}`}>
                              S{s.sessionNumber}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium">
                                {sessionKind(s.type)}
                                {s.sessionLabel ? ` · ${s.sessionLabel}` : ""}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {s.closedAt ? `Closed ${s.closedAt.toLocaleDateString()}` : s.dueAt && s.status === "COLLECTING" ? `Due ${s.dueAt.toLocaleDateString()}` : `Created ${s.createdAt.toLocaleDateString()}`}
                                {" · "}
                                {done}/{total} responded
                              </span>
                            </span>
                            <span className="hidden sm:block">
                              <Progress value={total ? (done / total) * 100 : 0} aria-label={`Session ${s.sessionNumber} responses`} />
                            </span>
                            <StatusBadge status={s.status} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  {hasOpen && <p className="mt-2 text-xs text-muted-foreground">Finish the session in progress before running this survey again.</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
