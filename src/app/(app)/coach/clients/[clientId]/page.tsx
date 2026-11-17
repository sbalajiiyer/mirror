import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Target } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { GiftFull360Button } from "@/components/billing/billing-controls";
import { coachGiftPrice } from "@/lib/services/billing";
import { creditBalance } from "@/lib/services/credits";
import { DomainError } from "@/lib/errors";
import { clientDetail, sessionPrep } from "@/lib/services/coach";
import { AIBriefButton, MeetingsPanel, NotesPanel } from "@/components/coach/coach-forms";
import { StatusBadge } from "@/components/assessment/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "Client" };
const f = (x: number | null | undefined) => (x == null ? "–" : x.toFixed(1));

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const user = await requireOnboardedUser(`/coach/clients/${clientId}`);
  let d: Awaited<ReturnType<typeof clientDetail>>;
  try {
    d = await clientDetail(user.id, clientId);
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
  const brief = await sessionPrep(user.id, clientId);
  const [gift, balance] = await Promise.all([coachGiftPrice(user.id), creditBalance(user.id)]);
  const shares = [
    ["Reports", d.link.shareReports],
    ["Comments", d.link.shareComments],
    ["Goals", d.link.shareGoals],
    ["Plan", d.link.sharePlan],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/coach" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> All clients
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{d.client.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {d.client.jobTitle && <span>{d.client.jobTitle} ·</span>}
          <span>Shared with you:</span>
          {shares.map(([label, on]) => (
            <Badge key={label} variant={on ? "secondary" : "outline"} className={on ? "" : "text-muted-foreground line-through"}>
              {label}
            </Badge>
          ))}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <GiftFull360Button clientId={clientId} price={gift.price} balance={balance} />
        {balance < gift.price && (
          <Link href="/billing" className="underline">
            Add credits
          </Link>
        )}
      </div>

      <Card data-testid="session-prep">
        <CardHeader>
          <CardTitle>Session prep</CardTitle>
          <CardDescription>
            {brief.basedOn ? `Based on ${brief.basedOn.label} (${brief.basedOn.raters} raters, ${new Date(brief.basedOn.date).toLocaleDateString()}).` : "Built from what your client shares."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>{brief.headline}</p>
          {brief.openSession && <p className="text-muted-foreground">In progress: {brief.openSession}</p>}
          {brief.basedOn && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Fact label="Strengths" value={brief.strengths.join(", ") || "–"} />
              <Fact label="Growth areas" value={brief.growthAreas.join(", ") || "–"} />
              <Fact label="Blind spot" value={brief.blindSpot ?? "None"} />
            </div>
          )}
          {brief.changes.length > 0 && (
            <div>
              <h3 className="mb-1 font-medium">Change since {brief.comparedWith}</h3>
              <table className="w-full text-sm" data-testid="prep-changes">
                <caption className="sr-only">Change in others&apos; average per competency</caption>
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="font-normal">Competency</th>
                    <th className="font-normal">Before</th>
                    <th className="font-normal">Now</th>
                    <th className="font-normal">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {brief.changes.map((c) => (
                    <tr key={c.name} className="border-t">
                      <td className="py-1">{c.name}</td>
                      <td>{f(c.before)}</td>
                      <td>{f(c.after)}</td>
                      <td className={c.delta > 0 ? "text-emerald-700 dark:text-emerald-400" : c.delta < 0 ? "text-red-700 dark:text-red-400" : ""}>
                        {c.delta > 0 ? "+" : ""}
                        {c.delta.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {brief.goals.length > 0 && (
            <div>
              <h3 className="mb-1 font-medium">Goals</h3>
              <ul className="space-y-2">
                {brief.goals.map((g) => (
                  <li key={g.title} className="flex items-center gap-3">
                    <Target className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex-1">{g.title}</span>
                    <Progress value={g.pct} className="w-28" aria-label={`${g.title} progress`} />
                    <span className="w-20 text-right text-xs text-muted-foreground">{g.achieved ? "Achieved" : `${g.pct}%`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="mb-1 font-medium">Questions to explore</h3>
            <ul className="list-disc space-y-1 pl-5" data-testid="prep-questions">
              {brief.questions.map((q) => (
                <li key={q.question}>
                  <span className="text-muted-foreground">{q.competency}: </span>
                  {q.question}
                </li>
              ))}
            </ul>
          </div>
          {brief.basedOn && <AIBriefButton clientId={clientId} />}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sessions</CardTitle>
            <CardDescription>{d.link.shareReports ? "Open a shared report to see the full results." : "Your client hasn't shared reports, so only status is shown."}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border text-sm">
              {d.sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    {s.shared ? (
                      <Link className="font-medium hover:underline" href={`/coach/clients/${clientId}/reports/${s.id}`}>
                        {s.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{s.name}</span>
                    )}
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.title} · {s.responses.done}/{s.responses.total} responded
                    </span>
                  </span>
                  {s.shared ? <StatusBadge status={s.status} /> : s.status === "CLOSED" ? <Lock className="size-4 text-muted-foreground" aria-label="Not shared" /> : <StatusBadge status={s.status} />}
                </li>
              ))}
              {d.sessions.length === 0 && <li className="px-3 py-2 text-muted-foreground">No sessions yet.</li>}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coaching sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <MeetingsPanel clientId={clientId} meetings={d.meetings.map((m) => ({ id: m.id, scheduledAt: m.scheduledAt.toISOString(), topic: m.topic }))} />
          </CardContent>
        </Card>

        {d.plan && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Development plan</CardTitle>
              <CardDescription>From {d.plan.assessmentTitle}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {d.plan.plan.areas.map((a) => (
                <div key={a.competency}>
                  <p className="font-medium">{a.competency}</p>
                  <ul className="mt-1 space-y-0.5">
                    {a.actions.map((x) => (
                      <li key={x.id} className={x.done ? "text-muted-foreground line-through" : ""}>
                        {x.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Private notes</CardTitle>
          </CardHeader>
          <CardContent>
            <NotesPanel clientId={clientId} notes={d.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() }))} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
