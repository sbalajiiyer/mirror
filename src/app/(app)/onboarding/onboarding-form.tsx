"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { GOALS, SENIORITY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveOnboarding } from "./actions";

type Values = {
  displayName: string;
  jobTitle: string;
  seniority: string;
  industry: string;
  goals: string[];
  feedbackTone: "direct" | "balanced" | "gentle";
};

export function OnboardingForm({ initial }: { initial: Values }) {
  const [v, setV] = useState<Values>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const toggleGoal = (key: string) =>
    setV((s) => ({ ...s, goals: s.goals.includes(key) ? s.goals.filter((g) => g !== key) : s.goals.length >= 3 ? s.goals : [...s.goals, key] }));

  return (
    <form
      className="mt-8 space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await saveOnboarding(v);
          if (!res.ok) setError(res.error);
          else router.push("/dashboard");
        });
      }}
    >
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="displayName">Your name</Label>
          <Input id="displayName" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} required autoComplete="name" />
          <p className="text-xs text-muted-foreground">Raters see your first name only.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="jobTitle">Role or title (optional)</Label>
          <Input id="jobTitle" value={v.jobTitle} onChange={(e) => setV({ ...v, jobTitle: e.target.value })} placeholder="e.g. Product manager, student, founder" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seniority">Career stage (optional)</Label>
          <select
            id="seniority"
            value={v.seniority}
            onChange={(e) => setV({ ...v, seniority: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Prefer not to say</option>
            {SENIORITY.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="industry">Industry (optional)</Label>
          <Input id="industry" value={v.industry} onChange={(e) => setV({ ...v, industry: e.target.value })} placeholder="e.g. Software, healthcare, education" />
        </div>
      </section>

      <fieldset>
        <legend className="text-sm font-medium">What do you want from this? (pick up to 3)</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {GOALS.map((g) => {
            const on = v.goals.includes(g.key);
            return (
              <button
                type="button"
                key={g.key}
                aria-pressed={on}
                onClick={() => toggleGoal(g.key)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent",
                  on && "border-primary bg-accent ring-1 ring-primary",
                )}
              >
                <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", on && "border-primary bg-primary text-primary-foreground")}>
                  {on && <Check className="size-3" />}
                </span>
                <span>
                  <span className="block text-sm font-medium">{g.label}</span>
                  <span className="block text-xs text-muted-foreground">{g.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">How should summaries talk to you?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["direct", "balanced", "gentle"] as const).map((t) => (
            <label key={t} className={cn("cursor-pointer rounded-full border px-4 py-1.5 text-sm capitalize", v.feedbackTone === t && "border-primary bg-accent")}>
              <input type="radio" name="tone" className="sr-only" checked={v.feedbackTone === t} onChange={() => setV({ ...v, feedbackTone: t })} />
              {t}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
