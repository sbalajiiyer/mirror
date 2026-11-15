"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Plus, Trash2, Users } from "lucide-react";
import { GOALS, RATER_GROUP_KINDS, goalLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { EMAIL_RE, parseRaterLines, type Rater } from "@/lib/rater-input";
import { createAssessmentAction } from "../actions";

export type WizardFramework = {
  id: string;
  name: string;
  description: string;
  version: number;
  competencies: { key: string; name: string; description: string; questions: { key: string; text: string; selfText: string }[] }[];
};

type Kind = (typeof RATER_GROUP_KINDS)[number]["kind"];
type Q = { id: string; competencyKey: string; questionKey: string | null; text: string; selfText: string; on: boolean };
type Group = { kind: Kind; name: string; raters: Rater[]; shareLink: boolean };

const STEPS = ["Goal", "Framework", "Questions", "Raters", "Settings", "Review"] as const;

export function Wizard({
  framework,
  defaultGoal,
  defaultMessage,
  subjectFirstName,
}: {
  framework: WizardFramework;
  defaultGoal: string;
  defaultMessage: string;
  subjectFirstName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(defaultGoal);
  const [title, setTitle] = useState(`${goalLabel(defaultGoal)} 360 — ${new Date().toLocaleDateString("en", { month: "long", year: "numeric" })}`);
  const [questions, setQuestions] = useState<Q[]>(() =>
    framework.competencies.flatMap((c) => c.questions.map((q) => ({ id: `${c.key}.${q.key}`, competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText, on: true }))),
  );
  const [groups, setGroups] = useState<Group[]>([
    { kind: "MANAGER", name: "Manager", raters: [], shareLink: false },
    { kind: "PEER", name: "Peers", raters: [], shareLink: false },
  ]);
  const [message, setMessage] = useState(defaultMessage);
  const [dueAt, setDueAt] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [minRaters, setMinRaters] = useState(3);
  const [managerSeparate, setManagerSeparate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const activeQs = questions.filter((q) => q.on);
  const raterCount = groups.reduce((s, g) => s + g.raters.length, 0);
  const minutes = Math.max(4, Math.round(activeQs.length * 0.2 + 3));

  const stepError = useMemo(() => {
    if (step === 0 && !title.trim()) return "Give your 360 a name.";
    if (step === 2 && activeQs.length < 5) return "Keep at least 5 questions.";
    if (step === 2 && activeQs.some((q) => q.text.trim().length < 5)) return "Questions can't be empty.";
    if (step === 3 && groups.length === 0) return "Add at least one rater group.";
    if (step === 3 && raterCount === 0 && !groups.some((g) => g.shareLink)) return "Add at least one rater or turn on a shareable link.";
    if (step === 4 && message.trim().length < 10) return "Write a short invite message.";
    return null;
  }, [step, title, activeQs, groups, raterCount, message]);

  const next = () => {
    if (stepError) return setError(stepError);
    setError(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createAssessmentAction({
        title,
        goal,
        frameworkId: framework.id,
        questions: activeQs.map(({ competencyKey, questionKey, text, selfText }) => ({ competencyKey, questionKey, text, selfText })),
        groups,
        inviteMessage: message,
        dueAt: dueAt ? new Date(`${dueAt}T17:00:00Z`).toISOString() : null,
        minRatersPerGroup: minRaters,
        showManagerSeparately: managerSeparate,
      });
      if (!res.ok) setError(res.error);
      else router.push(`/assessments/${res.data!.id}/self`);
    });

  const updateGroup = (i: number, patch: Partial<Group>) => setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Set up your 360</h1>
        <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-1.5", i === step ? "font-medium text-foreground" : "text-muted-foreground")} aria-current={i === step ? "step" : undefined}>
              <span className={cn("flex size-5 items-center justify-center rounded-full border text-[10px]", i < step && "border-primary bg-primary text-primary-foreground", i === step && "border-primary text-primary")}>
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <Progress className="mt-3" value={((step + 1) / STEPS.length) * 100} aria-label="Setup progress" />
      </div>

      <Card>
        {step === 0 && (
          <>
            <CardHeader>
              <CardTitle>What&apos;s this 360 for?</CardTitle>
              <CardDescription>Your goal shapes the report and (from Phase 3) your development plan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {GOALS.map((g) => (
                  <button
                    type="button"
                    key={g.key}
                    aria-pressed={goal === g.key}
                    onClick={() => setGoal(g.key)}
                    className={cn("rounded-lg border p-4 text-left hover:bg-accent", goal === g.key && "border-primary bg-accent ring-1 ring-primary")}
                  >
                    <span className="block text-sm font-medium">{g.label}</span>
                    <span className="block text-xs text-muted-foreground">{g.hint}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Name</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </CardContent>
          </>
        )}

        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle>Framework</CardTitle>
              <CardDescription>The competencies your raters will score. More frameworks (and an AI recommendation) arrive in later phases.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-primary bg-accent/50 p-4 ring-1 ring-primary">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{framework.name}</span>
                  <Badge variant="secondary">v{framework.version} · built-in</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{framework.description}</p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {framework.competencies.map((c) => (
                    <li key={c.key} className="text-sm">
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">{c.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </>
        )}

        {step === 2 && (
          <>
            <CardHeader>
              <CardTitle>Questions</CardTitle>
              <CardDescription>
                {activeQs.length} statements · about {minutes} minutes for raters. Untick any that don&apos;t fit, edit the wording, or add your own. Use {"{name}"} for your first name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {framework.competencies.map((c) => (
                <fieldset key={c.key} className="space-y-2">
                  <legend className="text-sm font-semibold">{c.name}</legend>
                  {questions
                    .filter((q) => q.competencyKey === c.key)
                    .map((q) => (
                      <div key={q.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`Include: ${q.text}`}
                          checked={q.on}
                          onChange={(e) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, on: e.target.checked } : x)))}
                          className="size-4 accent-[var(--primary)]"
                        />
                        <Input
                          value={q.text}
                          disabled={!q.on}
                          aria-label="Question text"
                          onChange={(e) =>
                            setQuestions((qs) =>
                              qs.map((x) =>
                                x.id === q.id
                                  ? { ...x, text: e.target.value, selfText: x.questionKey ? x.selfText : e.target.value.replaceAll("{name}", "I") }
                                  : x,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setQuestions((qs) => [
                        ...qs,
                        { id: `${c.key}.custom.${Date.now()}`, competencyKey: c.key, questionKey: null, text: "{name} ", selfText: "I ", on: true },
                      ])
                    }
                  >
                    <Plus /> Add a question
                  </Button>
                </fieldset>
              ))}
            </CardContent>
          </>
        )}

        {step === 3 && (
          <>
            <CardHeader>
              <CardTitle>Who should give feedback?</CardTitle>
              <CardDescription>
                Aim for 3–6 people per group. Groups with fewer than {minRaters} responses are combined with others so nobody can be identified.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {groups.map((g, i) => (
                <GroupEditor key={i} group={g} onChange={(patch) => updateGroup(i, patch)} onRemove={() => setGroups((gs) => gs.filter((_, j) => j !== i))} />
              ))}
              <div className="flex flex-wrap gap-2">
                {RATER_GROUP_KINDS.filter((k) => !groups.some((g) => g.kind === k.kind)).map((k) => (
                  <Button key={k.kind} type="button" variant="outline" size="sm" onClick={() => setGroups((gs) => [...gs, { kind: k.kind, name: k.label, raters: [], shareLink: false }])}>
                    <Plus /> {k.label}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                <Users className="mr-1 inline size-4" />
                {raterCount} {raterCount === 1 ? "person" : "people"} invited. You can add more later.
              </p>
            </CardContent>
          </>
        )}

        {step === 4 && (
          <>
            <CardHeader>
              <CardTitle>Invite and privacy settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="message">Invite message</Label>
                <Textarea id="message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
                <p className="text-xs text-muted-foreground">AI-drafted messages arrive in Phase 3.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="due">Due date</Label>
                  <Input id="due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="min">Minimum responses per group</Label>
                  <Input id="min" type="number" min={3} max={10} value={minRaters} onChange={(e) => setMinRaters(Math.max(3, Math.min(10, Number(e.target.value) || 3)))} />
                  <p className="text-xs text-muted-foreground">Never lower than 3.</p>
                </div>
              </div>
              {groups.some((g) => g.kind === "MANAGER") && (
                <label className="flex items-start gap-3 rounded-lg border p-4">
                  <input type="checkbox" className="mt-1 size-4" checked={managerSeparate} onChange={(e) => setManagerSeparate(e.target.checked)} />
                  <span className="text-sm">
                    <span className="font-medium">Show my manager&apos;s feedback separately</span>
                    <span className="block text-muted-foreground">
                      Your manager will be told their answers are visible to you. If off, their answers are combined with other groups.
                    </span>
                  </span>
                </label>
              )}
            </CardContent>
          </>
        )}

        {step === 5 && (
          <>
            <CardHeader>
              <CardTitle>Review</CardTitle>
              <CardDescription>Next you&apos;ll complete your self-assessment. Invites are only sent after that.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Item k="Name" v={title} />
                <Item k="Goal" v={goalLabel(goal)} />
                <Item k="Framework" v={`${framework.name} v${framework.version}`} />
                <Item k="Questions" v={`${activeQs.length} (≈${minutes} min)`} />
                <Item k="Raters" v={groups.map((g) => `${g.name}: ${g.raters.length}${g.shareLink ? " + link" : ""}`).join(" · ")} />
                <Item k="Due" v={dueAt || "No due date"} />
                <Item k="Anonymity" v={`At least ${minRaters} per group${managerSeparate ? ", manager shown separately" : ""}`} />
              </dl>
            </CardContent>
          </>
        )}

        <div className="flex items-center justify-between border-t p-5 sm:p-6">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Creating…" : "Create & rate myself"}
            </Button>
          )}
        </div>
      </Card>
      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}
      <p className="mt-3 text-center text-xs text-muted-foreground">Raters will see: &quot;{subjectFirstName}&quot; — never your email.</p>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function GroupEditor({ group, onChange, onRemove }: { group: Group; onChange: (p: Partial<Group>) => void; onRemove: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const add = (rs: Rater[]) => {
    const existing = new Set(group.raters.map((r) => r.email));
    onChange({ raters: [...group.raters, ...rs.filter((r) => !existing.has(r.email))] });
  };
  const hint = RATER_GROUP_KINDS.find((k) => k.kind === group.kind)?.hint;
  return (
    <div className="rounded-lg border p-4" data-testid={`group-${group.kind}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="font-medium">{group.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">{hint}</span>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${group.name}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      {group.raters.length > 0 && (
        <ul className="mt-3 space-y-1">
          {group.raters.map((r) => (
            <li key={r.email} className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5 text-sm">
              <span className="truncate">
                {r.name && <span className="font-medium">{r.name} </span>}
                <span className="text-muted-foreground">{r.email}</span>
              </span>
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${r.email}`} onClick={() => onChange({ raters: group.raters.filter((x) => x.email !== r.email) })}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const em = email.trim().toLowerCase();
          if (!EMAIL_RE.test(em)) return setErr("Enter a valid email");
          setErr(null);
          add([{ name: name.trim(), email: em }]);
          setName("");
          setEmail("");
        }}
      >
        <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label={`${group.name} rater name`} />
        <Input placeholder="email@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label={`${group.name} rater email`} />
        <Button type="submit" variant="secondary">
          Add
        </Button>
      </form>
      {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
        <button type="button" className="text-primary hover:underline" onClick={() => setShowBulk((s) => !s)}>
          Paste a list
        </button>
        <label className="flex items-center gap-2 text-muted-foreground">
          <input type="checkbox" checked={group.shareLink} onChange={(e) => onChange({ shareLink: e.target.checked })} />
          <Link2 className="size-4" /> Also create a shareable link for this group
        </label>
      </div>
      {showBulk && (
        <div className="mt-2 space-y-2">
          <Textarea rows={3} placeholder={"Sam Patel <sam@example.com>\nriya@example.com"} value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="Paste raters" />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              add(parseRaterLines(bulk));
              setBulk("");
              setShowBulk(false);
            }}
          >
            Add {parseRaterLines(bulk).length} people
          </Button>
        </div>
      )}
    </div>
  );
}
