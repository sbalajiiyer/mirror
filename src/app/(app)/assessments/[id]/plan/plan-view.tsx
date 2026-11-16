"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CalendarCheck, Dumbbell, RefreshCw, Sparkles, Target, Users } from "lucide-react";
import type { StoredPlan } from "@/lib/ai/features/plan";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { createPlanAction, togglePlanActionAction } from "../../ai-actions";
import { createGoalAction } from "../../progress-actions";

const STYLES = [
  ["", "No preference"],
  ["reading", "Reading"],
  ["video", "Videos & talks"],
  ["practice", "Hands-on practice"],
  ["conversation", "Conversations & mentoring"],
] as const;

function StylePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="style">How do you like to learn?</Label>
      <select id="style" value={value} onChange={(e) => onChange(e.target.value)} className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm">
        {STYLES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function useCreate(assessmentId: string) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "error" | "warning"; text: string } | null>(null);
  const router = useRouter();
  const create = (style: string) =>
    start(async () => {
      setMsg(null);
      const r = await createPlanAction(assessmentId, style || null);
      if (!r.ok) setMsg({ tone: "error", text: r.error });
      else {
        if (r.data?.warning) setMsg({ tone: "warning", text: r.data.warning });
        router.refresh();
      }
    });
  return { pending, msg, create };
}

export function CreatePlan({ assessmentId, learningStyle }: { assessmentId: string; learningStyle: string | null }) {
  const [style, setStyle] = useState(learningStyle ?? "");
  const { pending, msg, create } = useCreate(assessmentId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> Build a plan from your feedback
        </CardTitle>
        <CardDescription>
          For your top growth areas: concrete actions, a practice exercise, resources, 30/60/90-day milestones and who to ask for help. Tailored to your goal, role and how you like to learn.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <StylePicker value={style} onChange={setStyle} />
        <Button onClick={() => create(style)} disabled={pending} data-testid="create-plan">
          {pending ? "Building your plan… (up to 30 seconds)" : "Create my development plan"}
        </Button>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </CardContent>
    </Card>
  );
}

export function PlanView({
  assessmentId,
  planId,
  plan,
  createdAt,
  learningStyle,
}: {
  assessmentId: string;
  planId: string;
  plan: StoredPlan;
  createdAt: string;
  learningStyle: string | null;
}) {
  const [data, setData] = useState(plan);
  const [style, setStyle] = useState(learningStyle ?? "");
  const [showRegen, setShowRegen] = useState(false);
  const { pending, msg, create } = useCreate(assessmentId);
  const all = data.areas.flatMap((a) => a.actions);
  const done = all.filter((a) => a.done).length;

  const toggle = async (actionId: string, value: boolean) => {
    setData((d) => ({ ...d, areas: d.areas.map((a) => ({ ...a, actions: a.actions.map((x) => (x.id === actionId ? { ...x, done: value } : x)) })) }));
    const r = await togglePlanActionAction(assessmentId, planId, actionId, value);
    if (!r.ok) setData(plan);
  };

  return (
    <div className="space-y-6" data-testid="plan">
      <Card>
        <CardContent className="space-y-3 pt-5 sm:pt-6">
          <p className="leading-relaxed">{data.intro}</p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {done} of {all.length} actions done
            </span>
            <span>
              {data.generatedBy === "ai" ? "Written by AI" : data.generatedBy === "mock" ? "Sample plan — AI key not configured" : "Standard plan — AI was unavailable"} · {new Date(createdAt).toLocaleDateString()}
            </span>
          </div>
          <Progress value={all.length ? (done / all.length) * 100 : 0} aria-label="Plan progress" />
        </CardContent>
      </Card>

      {data.areas.map((area) => (
        <Card key={area.competency} className="avoid-break">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>{area.competency}</CardTitle>
              {area.competencyKey && <MakeGoal assessmentId={assessmentId} competencyKey={area.competencyKey} />}
            </div>
            <CardDescription>{area.why}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</h3>
              <ul className="space-y-2">
                {area.actions.map((a) => (
                  <li key={a.id}>
                    <label className="flex cursor-pointer gap-3 rounded-lg border p-3 hover:bg-accent/50">
                      <input type="checkbox" className="mt-1 size-4" checked={a.done} onChange={(e) => toggle(a.id, e.target.checked)} />
                      <span className={a.done ? "text-muted-foreground line-through" : ""}>
                        <span className="font-medium">{a.title}</span>
                        <span className="block text-sm text-muted-foreground">{a.detail}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
            <section className="flex gap-3 rounded-lg bg-muted/50 p-3 text-sm">
              <Dumbbell className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Practice exercise</p>
                <p className="text-muted-foreground">{area.exercise}</p>
              </div>
            </section>
            <section className="grid gap-4 sm:grid-cols-3">
              {(["d30", "d60", "d90"] as const).map((k) => (
                <div key={k} className="rounded-lg border p-3 text-sm">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <CalendarCheck className="size-3.5" /> {k.slice(1)} days
                  </p>
                  {area.milestones[k]}
                </div>
              ))}
            </section>
            <div className="grid gap-4 sm:grid-cols-2">
              {area.resources.length > 0 && (
                <section className="text-sm">
                  <p className="mb-1 flex items-center gap-1.5 font-medium">
                    <BookOpen className="size-4" /> Resources
                  </p>
                  <ul className="space-y-1">
                    {area.resources.map((r, i) => (
                      <li key={i}>
                        <Badge variant="outline" className="mr-1.5 capitalize">
                          {r.type}
                        </Badge>
                        {r.title}
                        {r.note && <span className="text-muted-foreground"> — {r.note}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {area.helpers.length > 0 && (
                <section className="text-sm">
                  <p className="mb-1 flex items-center gap-1.5 font-medium">
                    <Users className="size-4" /> Who can help
                  </p>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {area.helpers.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-muted-foreground">AI suggestions can be wrong, including resource titles — treat them as starting points.</p>

      <div className="no-print">
        {showRegen ? (
          <Card>
            <CardContent className="space-y-3 pt-5 sm:pt-6">
              <StylePicker value={style} onChange={setStyle} />
              <p className="text-sm text-muted-foreground">A new plan replaces this one (your ticked actions won&apos;t carry over).</p>
              <Button onClick={() => create(style)} disabled={pending}>
                {pending ? "Building…" : "Create a new plan"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Button variant="outline" onClick={() => setShowRegen(true)}>
            <RefreshCw /> Make a new plan
          </Button>
        )}
        {msg && <Alert tone={msg.tone} className="mt-3">{msg.text}</Alert>}
      </div>
    </div>
  );
}

function MakeGoal({ assessmentId, competencyKey }: { assessmentId: string; competencyKey: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  return (
    <div className="no-print text-right">
      <Button
        size="sm"
        variant="outline"
        disabled={state === "busy" || state === "done"}
        onClick={async () => {
          setState("busy");
          const r = await createGoalAction(assessmentId, competencyKey);
          setState(r.ok ? "done" : r.error);
        }}
      >
        <Target /> {state === "done" ? "Goal added" : "Make this a goal"}
      </Button>
      {state !== "idle" && state !== "busy" && state !== "done" && <p className="mt-1 max-w-48 text-xs text-muted-foreground">{state}</p>}
    </div>
  );
}
