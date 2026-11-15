"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Lock, ShieldCheck } from "lucide-react";
import { RATING_LABELS } from "@/lib/frameworks/core-360";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

export type QCompetency = { key: string; name: string; questions: { id: string; text: string }[] };
export type QAnswers = {
  ratings: Record<string, number | null>;
  competencyComments: Record<string, string>;
  start: string;
  stop: string;
  continue: string;
  general: string;
  deidentify?: boolean;
};
export type QDraft = QAnswers & { step: number };
type Result = { ok: true } | { ok: false; error: string };

const empty: QAnswers = { ratings: {}, competencyComments: {}, start: "", stop: "", continue: "", general: "", deidentify: true };

export function Questionnaire({
  mode,
  subjectFirstName,
  competencies,
  scaleMax,
  initialDraft,
  intro,
  onSaveDraft,
  onSubmit,
  onDone,
  onPreviewDeidentify,
}: {
  mode: "rater" | "self";
  subjectFirstName: string;
  competencies: QCompetency[];
  scaleMax: number;
  initialDraft?: QDraft | null;
  intro: React.ReactNode;
  onSaveDraft?: (d: QDraft) => Promise<Result>;
  onSubmit: (a: QAnswers) => Promise<Result>;
  onDone?: () => void;
  onPreviewDeidentify?: (texts: string[]) => Promise<{ ok: true; data?: { texts: string[]; usedAI: boolean } } | { ok: false; error: string }>;
}) {
  const [answers, setAnswers] = useState<QAnswers>(() => ({ ...empty, ...(initialDraft ?? {}) }));
  // Steps: 0 intro, 1..n competencies, n+1 open questions (rater only), last = review
  const compSteps = competencies.length;
  const openStep = mode === "rater" ? compSteps + 1 : -1;
  const reviewStep = mode === "rater" ? compSteps + 2 : compSteps + 1;
  const [step, setStep] = useState(() => Math.min(initialDraft?.step ?? 0, reviewStep));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">(initialDraft ? "saved" : "idle");
  const [submitted, setSubmitted] = useState(false);
  const [pending, start] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);

  const allQ = useMemo(() => competencies.flatMap((c) => c.questions), [competencies]);
  const answered = allQ.filter((q) => q.id in answers.ratings).length;
  const pct = Math.round((answered / Math.max(1, allQ.length)) * 100);

  // Debounced autosave (rater mode): survives closing the tab; resume from the same link.
  const dirty = useRef(false);
  const save = useCallback(
    async (s: number, a: QAnswers) => {
      if (!onSaveDraft) return;
      setSaved("saving");
      const res = await onSaveDraft({ ...a, step: s });
      setSaved(res.ok ? "saved" : "error");
    },
    [onSaveDraft],
  );
  useEffect(() => {
    if (!dirty.current || !onSaveDraft) return;
    const t = setTimeout(() => save(step, answers), 1200);
    return () => clearTimeout(t);
  }, [answers, step, save, onSaveDraft]);

  const update = (fn: (a: QAnswers) => QAnswers) => {
    dirty.current = true;
    setAnswers(fn);
  };

  const go = (s: number) => {
    setError(null);
    if (step >= 1 && step <= compSteps && s > step) {
      const comp = competencies[step - 1];
      const missing = comp.questions.filter((q) => !(q.id in answers.ratings));
      if (missing.length) {
        setError(`Please answer all ${comp.questions.length} statements (choose “Don't know” if you haven't seen it).`);
        return;
      }
    }
    dirty.current = true;
    setStep(s);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await onSubmit(answers);
      if (!res.ok) return setError(res.error);
      setSubmitted(true);
      onDone?.();
    });

  if (submitted) {
    return (
      <div className="py-10 text-center" role="status">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
        <h2 className="mt-4 text-xl font-semibold">{mode === "rater" ? "Thank you!" : "Self-assessment locked"}</h2>
        <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
          {mode === "rater"
            ? `Your feedback has been submitted anonymously. ${subjectFirstName} will only see it combined with others.`
            : "You can now invite your raters."}
        </p>
      </div>
    );
  }

  return (
    <div ref={topRef} className="scroll-mt-20">
      <div className="sticky top-0 z-10 -mx-4 mb-6 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {answered} of {allQ.length} answered
          </span>
          {onSaveDraft && (
            <span aria-live="polite">{saved === "saving" ? "Saving…" : saved === "saved" ? "Progress saved" : saved === "error" ? "Couldn't save — check your connection" : ""}</span>
          )}
        </div>
        <Progress className="mt-2" value={pct} aria-label="Questionnaire progress" />
      </div>

      {step === 0 && (
        <div className="space-y-6">
          {intro}
          <Button size="lg" className="w-full sm:w-auto" onClick={() => go(1)}>
            {answered > 0 ? "Continue where I left off" : "Start"} <ChevronRight />
          </Button>
        </div>
      )}

      {step >= 1 && step <= compSteps && (
        <CompetencyStep
          comp={competencies[step - 1]}
          index={step}
          total={compSteps}
          scaleMax={scaleMax}
          mode={mode}
          subjectFirstName={subjectFirstName}
          answers={answers}
          update={update}
        />
      )}

      {step === openStep && (
        <section className="space-y-5" aria-labelledby="open-h">
          <div>
            <h2 id="open-h" className="text-xl font-semibold">
              In your own words
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Optional, but this is often the most useful part. Avoid details that would identify you.</p>
          </div>
          {(
            [
              ["start", `What should ${subjectFirstName} START doing?`],
              ["stop", `What should ${subjectFirstName} STOP doing?`],
              ["continue", `What should ${subjectFirstName} CONTINUE doing?`],
              ["general", "Anything else you'd like to share?"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`open-${k}`}>{label}</Label>
              <Textarea id={`open-${k}`} rows={3} maxLength={2000} value={answers[k]} onChange={(e) => update((a) => ({ ...a, [k]: e.target.value }))} />
            </div>
          ))}
          {onPreviewDeidentify && <DeidentifyOption answers={answers} update={update} onPreview={onPreviewDeidentify} />}
        </section>
      )}

      {step === reviewStep && (
        <section className="space-y-4" aria-labelledby="review-h">
          <h2 id="review-h" className="text-xl font-semibold">
            Ready to submit?
          </h2>
          <ul className="divide-y rounded-lg border">
            {competencies.map((c, i) => {
              const done = c.questions.filter((q) => q.id in answers.ratings).length;
              return (
                <li key={c.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>{c.name}</span>
                  <button className="text-primary hover:underline" onClick={() => go(i + 1)}>
                    {done}/{c.questions.length} · Edit
                  </button>
                </li>
              );
            })}
          </ul>
          {mode === "self" ? (
            <Alert tone="warning">
              <Lock className="mr-1 inline size-4" /> Once submitted, your self-assessment is locked so the comparison with others stays honest.
            </Alert>
          ) : (
            <Alert tone="info">
              <ShieldCheck className="mr-1 inline size-4" /> Your answers are stored without your name or email and only shown combined with others.
            </Alert>
          )}
        </section>
      )}

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      {step > 0 && (
        <div className="mt-8 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => go(step - 1)}>
            <ChevronLeft /> Back
          </Button>
          {step < reviewStep ? (
            <Button size="lg" onClick={() => go(step + 1)}>
              Next <ChevronRight />
            </Button>
          ) : (
            <Button size="lg" onClick={submit} disabled={pending}>
              {pending ? "Submitting…" : mode === "self" ? "Submit & lock" : "Submit feedback"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function CompetencyStep({
  comp,
  index,
  total,
  scaleMax,
  mode,
  subjectFirstName,
  answers,
  update,
}: {
  comp: QCompetency;
  index: number;
  total: number;
  scaleMax: number;
  mode: "rater" | "self";
  subjectFirstName: string;
  answers: QAnswers;
  update: (fn: (a: QAnswers) => QAnswers) => void;
}) {
  const values = Array.from({ length: scaleMax }, (_, i) => i + 1);
  return (
    <section aria-labelledby={`c-${comp.key}`} className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Section {index} of {total}
        </p>
        <h2 id={`c-${comp.key}`} className="mt-1 text-xl font-semibold">
          {comp.name}
        </h2>
        <p className="text-sm text-muted-foreground">How often {mode === "self" ? "do you" : `does ${subjectFirstName}`} do the following?</p>
      </div>
      {comp.questions.map((q) => {
        const current = answers.ratings[q.id];
        const has = q.id in answers.ratings;
        const set = (v: number | null) => update((a) => ({ ...a, ratings: { ...a.ratings, [q.id]: v } }));
        return (
          <fieldset key={q.id} className="space-y-2" data-testid="rating-question">
            <legend className="mb-2 font-medium">{q.text}</legend>
            <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={q.text}>
              {values.map((v) => (
                <label
                  key={v}
                  className={cn(
                    "flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-lg border text-center transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring",
                    current === v && "border-primary bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  <input type="radio" name={q.id} value={v} checked={current === v} onChange={() => set(v)} className="sr-only" />
                  <span className="text-base font-semibold">{v}</span>
                  <span className="px-0.5 text-[10px] leading-tight sm:text-xs">{RATING_LABELS[v] ?? ""}</span>
                </label>
              ))}
            </div>
            <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent", has && current === null && "bg-accent font-medium text-foreground")}>
              <input type="radio" name={q.id} value="na" checked={has && current === null} onChange={() => set(null)} className="size-3.5" />
              {mode === "self" ? "Not applicable" : "Don't know / haven't seen this"}
            </label>
          </fieldset>
        );
      })}
      {mode === "rater" && (
        <div className="space-y-1.5">
          <Label htmlFor={`cc-${comp.key}`}>Comment on {comp.name.toLowerCase()} (optional)</Label>
          <Textarea
            id={`cc-${comp.key}`}
            rows={2}
            maxLength={2000}
            value={answers.competencyComments[comp.key] ?? ""}
            onChange={(e) => update((a) => ({ ...a, competencyComments: { ...a.competencyComments, [comp.key]: e.target.value } }))}
          />
        </div>
      )}
    </section>
  );
}

function DeidentifyOption({
  answers,
  update,
  onPreview,
}: {
  answers: QAnswers;
  update: (fn: (a: QAnswers) => QAnswers) => void;
  onPreview: (texts: string[]) => Promise<{ ok: true; data?: { texts: string[]; usedAI: boolean } } | { ok: false; error: string }>;
}) {
  const [preview, setPreview] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const texts = [...Object.values(answers.competencyComments), answers.start, answers.stop, answers.continue, answers.general].filter((t) => t.trim());
  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4" checked={answers.deidentify ?? true} onChange={(e) => update((a) => ({ ...a, deidentify: e.target.checked }))} />
        <span>
          <span className="font-medium">Remove details that could identify me</span>
          <span className="block text-muted-foreground">
            AI rewrites your comments to remove names, places, dates and other give-aways before they are saved. Your original wording is not kept.
          </span>
        </span>
      </label>
      {answers.deidentify !== false && texts.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await onPreview(texts);
              if (r.ok && r.data) {
                setPreview(r.data.texts);
                setNote(r.data.usedAI ? null : "AI isn't available right now; only emails, phone numbers and links will be removed.");
              } else if (!r.ok) setNote(r.error);
            })
          }
        >
          {pending ? "Rewriting…" : "Preview rewritten comments"}
        </Button>
      )}
      {preview && (
        <ul className="space-y-2 text-sm" aria-label="Rewritten comments" data-testid="deidentify-preview">
          {preview.filter((t) => t.trim()).map((t, i) => (
            <li key={i} className="rounded-md bg-card p-2 shadow-sm">
              {t}
            </li>
          ))}
        </ul>
      )}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
