"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Flame, Minus, Target, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compare, trendRows, type GoalProgress, type SeriesPoint } from "@/lib/progress";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Legend } from "@/components/report/legend";
import { OTHERS_COLOR, SELF_COLOR, fmt } from "@/components/report/palette";
import { archiveGoalAction, createGoalAction, setCadenceAction, updateGoalTargetAction } from "@/app/(app)/assessments/progress-actions";

type GoalView = {
  id: string;
  title: string;
  competencyKey: string;
  competencyName: string;
  baseline: number | null;
  target: number;
  status: string;
} & GoalProgress;

const BEFORE_COLOR = "var(--chart-1)";
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

export function ProgressView({
  seriesList,
  root,
  points,
  goals,
  streak,
  inProgress,
  latestClosedId,
  scaleMax,
}: {
  seriesList: { id: string; title: string }[];
  root: { id: string; title: string; cadenceMonths: number | null; nextPulseDueAt: string | null };
  points: SeriesPoint[];
  goals: GoalView[];
  streak: { count: number; onTrack: boolean; pulses: number };
  inProgress: { id: string; title: string; status: string }[];
  latestClosedId: string | null;
  scaleMax: number;
}) {
  const router = useRouter();
  const sorted = useMemo(() => [...points].sort((a, b) => a.date.localeCompare(b.date)), [points]);
  const { competencies, rows } = useMemo(() => trendRows(sorted), [sorted]);
  const latest = sorted[sorted.length - 1];

  return (
    <div className="space-y-6" data-testid="progress">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
          <p className="text-muted-foreground">How others&apos; view of you is changing across your 360 and pulse checks.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {seriesList.length > 1 && (
            <select
              aria-label="Choose 360"
              value={root.id}
              onChange={(e) => router.push(`/progress?series=${e.target.value}`)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
          {latestClosedId && (
            <Button asChild>
              <Link href={`/assessments/${latestClosedId}/pulse/new`}>Start a pulse check</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5 sm:pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Check-ins</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{sorted.length}</p>
            <p className="text-xs text-muted-foreground">1 full 360 · {streak.pulses} pulse{streak.pulses === 1 ? "" : "s"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 sm:pt-6">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Flame className="size-3.5" /> Streak
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid="streak">
              {streak.count}
            </p>
            <p className="text-xs text-muted-foreground">
              {root.cadenceMonths ? (streak.onTrack ? `pulses on schedule (every ${root.cadenceMonths} mo)` : "streak paused — run a pulse to restart") : "set a rhythm to track a streak"}
            </p>
          </CardContent>
        </Card>
        <CadenceCard rootId={root.id} cadence={root.cadenceMonths} nextDue={root.nextPulseDueAt} />
      </div>

      {inProgress.length > 0 && (
        <Alert tone="info">
          In progress:{" "}
          {inProgress.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ", "}
              <Link className="underline" href={`/assessments/${a.id}`}>
                {a.title}
              </Link>
            </span>
          ))}
        </Alert>
      )}

      <GoalsCard goals={goals} latest={latest ?? null} latestClosedId={latestClosedId} scaleMax={scaleMax} />

      <Card>
        <CardHeader>
          <CardTitle>Trends by competency</CardTitle>
          <CardDescription>Others&apos; average at each check-in, with your self-rating. Pulses only re-measure the competencies you chose.</CardDescription>
          <Legend
            items={[
              { label: "Others", color: OTHERS_COLOR },
              { label: "Self", color: SELF_COLOR, dashed: true },
            ]}
          />
        </CardHeader>
        <CardContent>
          {sorted.length < 2 ? (
            <p className="text-sm text-muted-foreground" data-testid="trends-empty">
              Trends appear after your first pulse check closes.
            </p>
          ) : (
            <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="trends">
              {competencies
                .filter((c) => c.measured > 1)
                .map((c) => {
                  const data = rows.map((r) => ({ label: shortDate(r.date), others: r[`${c.key}:others`] ?? null, self: r[`${c.key}:self`] ?? null, title: r.label }));
                  const first = data.find((d) => d.others != null)?.others as number | undefined;
                  const last = [...data].reverse().find((d) => d.others != null)?.others as number | undefined;
                  const delta = first != null && last != null ? last - first : null;
                  return (
                    <div key={c.key} className="rounded-lg border p-3" data-testid="trend-chart">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <h4 className="text-sm font-medium">{c.name}</h4>
                        <Delta value={delta} measured={c.measured} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {c.statements} statement{c.statements === 1 ? "" : "s"} asked every time
                      </p>
                      <div className="h-36" role="img" aria-label={`${c.name}: ${data.map((d) => `${d.label} ${fmt(d.others as number | null)}`).join(", ")}`}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -24 }}>
                            <CartesianGrid stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                            <YAxis domain={[1, scaleMax]} ticks={Array.from({ length: scaleMax }, (_, i) => i + 1)} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(typeof v === "number" ? v : null)} labelFormatter={(_, p) => (p?.[0]?.payload?.title as string) ?? ""} />
                            <Line type="monotone" dataKey="others" name="Others" stroke={OTHERS_COLOR} strokeWidth={2} dot={{ r: 3.5 }} connectNulls isAnimationActive={false} />
                            <Line type="monotone" dataKey="self" name="Self" stroke={SELF_COLOR} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })}
            </div>
            {competencies.some((c) => c.measured <= 1) && (
              <p className="mt-3 text-xs text-muted-foreground">
                Measured once so far: {competencies.filter((c) => c.measured <= 1).map((c) => c.name).join(", ")}. Include them in a pulse to see a trend.
              </p>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {sorted.length >= 2 && <BeforeAfter points={sorted} scaleMax={scaleMax} />}
    </div>
  );
}

function Delta({ value, measured }: { value: number | null; measured: number }) {
  if (value == null || measured < 2) return <span className="text-xs text-muted-foreground">measured once</span>;
  const r = Math.round(value * 10) / 10;
  if (Math.abs(r) < 0.1)
    return (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="size-3" /> no change
      </span>
    );
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${r > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
      {r > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {r > 0 ? "+" : ""}
      {r.toFixed(1)}
    </span>
  );
}

function CadenceCard({ rootId, cadence, nextDue }: { rootId: string; cadence: number | null; nextDue: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card>
      <CardContent className="space-y-2 pt-5 sm:pt-6">
        <Label htmlFor="rhythm" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Pulse rhythm
        </Label>
        <select
          id="rhythm"
          value={cadence ?? 0}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              await setCadenceAction(rootId, Number(e.target.value) as 0 | 1 | 2 | 3);
              router.refresh();
            })
          }
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value={0}>No reminders</option>
          <option value={1}>Every month</option>
          <option value={2}>Every 2 months</option>
          <option value={3}>Every 3 months</option>
        </select>
        <p className="text-xs text-muted-foreground">{nextDue ? `Next pulse due ${new Date(nextDue).toLocaleDateString()}` : "We'll email you when a pulse is due."}</p>
      </CardContent>
    </Card>
  );
}

function GoalsCard({ goals, latest, latestClosedId, scaleMax }: { goals: GoalView[]; latest: SeriesPoint | null; latestClosedId: string | null; scaleMax: number }) {
  const [comp, setComp] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const available = latest ? Object.entries(latest.competencies).filter(([k]) => !goals.some((g) => g.competencyKey === k && g.status === "ACTIVE")) : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="size-4" /> Goals
        </CardTitle>
        <CardDescription>Pick a competency and a target score. Each pulse check updates your progress automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {goals.length === 0 && <p className="text-sm text-muted-foreground">No goals yet.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} scaleMax={scaleMax} />
          ))}
        </div>
        {latestClosedId && available.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="goal-comp">New goal</Label>
              <select id="goal-comp" value={comp} onChange={(e) => setComp(e.target.value)} className="flex h-10 min-w-56 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Choose a competency…</option>
                {available.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.name} (now {fmt(v.others)})
                  </option>
                ))}
              </select>
            </div>
            <Button
              disabled={!comp || pending}
              data-testid="add-goal"
              onClick={() =>
                start(async () => {
                  setMsg(null);
                  const r = await createGoalAction(latestClosedId, comp);
                  if (!r.ok) setMsg(r.error);
                  else {
                    setComp("");
                    router.refresh();
                  }
                })
              }
            >
              Add goal
            </Button>
          </div>
        )}
        {msg && <Alert tone="error">{msg}</Alert>}
      </CardContent>
    </Card>
  );
}

function GoalCard({ goal, scaleMax }: { goal: GoalView; scaleMax: number }) {
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(goal.target);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2 rounded-lg border p-4" data-testid="goal">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{goal.title}</p>
          <p className="text-xs text-muted-foreground">
            Started at {fmt(goal.baselineNow ?? goal.baseline)} · now {fmt(goal.latest)} · target {goal.target.toFixed(1)}
          </p>
        </div>
        {goal.status === "ACHIEVED" ? <Badge variant="success">Achieved</Badge> : <Badge variant="outline">{goal.measurements ? `${goal.pct}%` : "Awaiting pulse"}</Badge>}
      </div>
      <Progress value={goal.pct} aria-label={`${goal.title} progress`} />
      {!goal.measurements && <p className="text-xs text-muted-foreground">Run a pulse that includes {goal.competencyName.toLowerCase()} to measure progress.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Input type="number" step={0.1} min={1} max={scaleMax} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="h-8 w-20" aria-label="Target" />
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await updateGoalTargetAction(goal.id, target);
                  setEditing(false);
                  router.refresh();
                })
              }
            >
              Save
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Change target
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          aria-label="Archive goal"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await archiveGoalAction(goal.id);
              router.refresh();
            })
          }
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function BeforeAfter({ points, scaleMax }: { points: SeriesPoint[]; scaleMax: number }) {
  const [a, setA] = useState(points[0].assessmentId);
  const [b, setB] = useState(points[points.length - 1].assessmentId);
  const before = points.find((p) => p.assessmentId === a)!;
  const after = points.find((p) => p.assessmentId === b)!;
  const rows = compare(before, after);
  const data = rows.map((r) => ({ name: r.name, before: r.before, after: r.after }));
  const label = (p: SeriesPoint) => `${p.title} (${shortDate(p.date)})`;
  return (
    <Card data-testid="before-after">
      <CardHeader>
        <CardTitle>Before and after</CardTitle>
        <CardDescription>Compare any two check-ins on the competencies they both measured.</CardDescription>
        <div className="flex flex-wrap gap-3 pt-2">
          {(
            [
              ["Before", a, setA],
              ["After", b, setB],
            ] as const
          ).map(([l, v, set]) => (
            <label key={l} className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{l}</span>
              <select aria-label={l} value={v} onChange={(e) => set(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                {points.map((p) => (
                  <option key={p.assessmentId} value={p.assessmentId}>
                    {label(p)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {rows.length < 3 ? (
          <p className="text-sm text-muted-foreground lg:col-span-2">These two check-ins share fewer than 3 competencies, so there&apos;s no radar — see the table.</p>
        ) : (
          <div>
            <div className="h-72" role="img" aria-label="Radar comparing two check-ins">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data} outerRadius="70%">
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                  <PolarRadiusAxis domain={[1, scaleMax]} tickCount={scaleMax} angle={90} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} />
                  <Radar name="Before" dataKey="before" stroke={BEFORE_COLOR} fill={BEFORE_COLOR} fillOpacity={0.1} strokeWidth={2} strokeDasharray="4 3" isAnimationActive={false} />
                  <Radar name="After" dataKey="after" stroke={OTHERS_COLOR} fill={OTHERS_COLOR} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(typeof v === "number" ? v : null)} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <Legend
              items={[
                { label: `Before: ${label(before)}`, color: BEFORE_COLOR, dashed: true },
                { label: `After: ${label(after)}`, color: OTHERS_COLOR },
              ]}
            />
          </div>
        )}
        <table className="w-full self-start text-sm">
          <caption className="sr-only">Change in others&apos; average per competency</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Competency</th>
              <th className="pb-2 text-right font-medium">Before</th>
              <th className="pb-2 text-right font-medium">After</th>
              <th className="pb-2 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-2">
                  {r.name}
                  <span className="block text-[11px] text-muted-foreground">
                    {r.statements} shared statement{r.statements === 1 ? "" : "s"}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{fmt(r.before)}</td>
                <td className="py-2 text-right tabular-nums">{fmt(r.after)}</td>
                <td className="py-2 text-right">
                  <span className="inline-flex justify-end">
                    <Delta value={r.delta} measured={2} />
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-muted-foreground">
                  No competencies in common.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
