import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle, Clock, Mail } from "lucide-react";
import { db } from "@/lib/db";
import { effectiveMinRaters } from "@/lib/anonymity";
import { goalLabel, groupKindLabel } from "@/lib/constants";
import { requireOwnedAssessment } from "@/lib/session";
import { derivedToken } from "@/lib/tokens";
import { appUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/assessment/status-badge";
import { SessionHeader } from "@/components/survey/session-header";
import { sessionKind, surveyCode } from "@/lib/survey";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AddRaters, CopyButton, LifecycleActions, RemoveInvite } from "./controls";

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOwnedAssessment(id);
  const a = await db.assessment.findUniqueOrThrow({
    where: { id },
    include: {
      raterGroups: { orderBy: { order: "asc" }, include: { invites: { orderBy: { createdAt: "asc" } } } },
      reports: { orderBy: { generatedAt: "desc" }, take: 1 },
    },
  });
  if (a.status === "CLOSED" && (a.reports[0]?.data as { anonymity?: { available?: boolean } })?.anonymity?.available) {
    redirect(`/assessments/${id}/report`);
  }
  const min = effectiveMinRaters(a.minRatersPerGroup);
  const groups = a.raterGroups.filter((g) => g.kind !== "SELF");
  const invites = groups.flatMap((g) => g.invites);
  const submitted = invites.filter((i) => i.status === "SUBMITTED").length;

  const steps = [
    { label: "Set up", done: true },
    { label: "Rate yourself", done: !!a.selfLockedAt },
    { label: "Invite raters", done: a.status === "COLLECTING" || a.status === "CLOSED" },
    { label: "Collect feedback", done: a.status === "CLOSED" },
    { label: "Read your report", done: false },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
            ← My 360s
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{a.title}</h1>
          <SessionHeader assessmentId={a.id} code={surveyCode(a.rootAssessmentId ?? a.id)} sessionNumber={a.sessionNumber} kind={sessionKind(a.type)} label={a.sessionLabel} company={a.company} tags={a.tags} />
          <p className="text-muted-foreground">Goal: {goalLabel(a.goal)}</p>
        </div>
        <StatusBadge status={a.status} />
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Progress">
        {steps.map((s) => (
          <li key={s.label} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", s.done ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "text-muted-foreground")}>
            {s.done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4" />}
            {s.label}
          </li>
        ))}
      </ol>

      {a.status === "DRAFT" && (
        <Card>
          <CardHeader>
            <CardTitle>Next: rate yourself</CardTitle>
            <CardDescription>Invites go out only after your self-assessment is submitted and locked.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/assessments/${a.id}/self`}>Start self-assessment</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {(a.status === "READY" || a.status === "COLLECTING" || a.status === "CLOSED") && (
        <LifecycleActions assessmentId={a.id} status={a.status} submitted={submitted} invites={invites.length} min={min} />
      )}

      {a.status === "CLOSED" && (
        <Alert tone="warning">
          This 360 closed with too few responses to show results without risking anyone&apos;s anonymity (at least {min} needed). You can reopen it and invite more people.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rater progress</CardTitle>
          <CardDescription>
            {submitted} of {invites.length} responded. Results are shown per group once at least {min} people in it respond; smaller groups are combined. Your report is generated when you close the 360 — not before — so no single response can be singled out.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {groups.map((g) => {
            const done = g.invites.filter((i) => i.status === "SUBMITTED").length;
            const shareUrl = g.shareTokenHash ? appUrl(`/r/g/${derivedToken("group", g.id)}`) : null;
            return (
              <section key={g.id} aria-label={g.name} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{g.name}</h3>
                    <Badge variant="outline">{groupKindLabel(g.kind)}</Badge>
                    {g.kind === "MANAGER" && a.showManagerSeparately && <Badge variant="warning">shown separately</Badge>}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {done}/{g.invites.length}
                    {done < min && g.kind !== "MANAGER" ? ` · ${min - done} more to show separately` : ""}
                  </span>
                </div>
                <Progress value={g.invites.length ? (done / g.invites.length) * 100 : 0} aria-label={`${g.name} progress`} />
                <ul className="divide-y rounded-md border text-sm">
                  {g.invites.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0 truncate">
                        {inv.channel === "LINK" ? <span className="text-muted-foreground">Via shared link</span> : <>{inv.name && <span className="font-medium">{inv.name} </span>}<span className="text-muted-foreground">{inv.email}</span></>}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <InviteStatus status={inv.status} invited={!!inv.invitedAt} reminders={inv.reminderCount} />
                        {inv.status !== "SUBMITTED" && a.status !== "CLOSED" && <RemoveInvite assessmentId={a.id} inviteId={inv.id} />}
                      </span>
                    </li>
                  ))}
                  {g.invites.length === 0 && <li className="px-3 py-2 text-muted-foreground">No one yet.</li>}
                </ul>
                {shareUrl && a.status === "COLLECTING" && (
                  <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs">
                    <span className="truncate font-mono">{shareUrl}</span>
                    <CopyButton text={shareUrl} />
                  </div>
                )}
                {a.status !== "CLOSED" && <AddRaters assessmentId={a.id} groupId={g.id} groupName={g.name} />}
              </section>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function InviteStatus({ status, invited, reminders }: { status: string; invited: boolean; reminders: number }) {
  if (status === "SUBMITTED") return <Badge variant="success">Responded</Badge>;
  if (status === "DECLINED") return <Badge variant="outline">Declined</Badge>;
  if (status === "STARTED") return <Badge variant="secondary"><Clock className="mr-1 size-3" />In progress</Badge>;
  if (!invited) return <Badge variant="outline">Not sent yet</Badge>;
  return (
    <Badge variant="outline">
      <Mail className="mr-1 size-3" />
      Invited{reminders ? ` · ${reminders} reminder${reminders > 1 ? "s" : ""}` : ""}
    </Badge>
  );
}
