"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { fmt } from "@/components/report/palette";
import { createPulseAction } from "../../../progress-actions";

type Comp = { key: string; name: string; questions: { id: string; text: string; others: number | null }[] };

export function PulseForm({ sourceId, competencies, defaults, raterCount, cadence }: { sourceId: string; competencies: Comp[]; defaults: string[]; raterCount: number; cadence: number }) {
  const [picked, setPicked] = useState<string[]>(defaults);
  const [reuse, setReuse] = useState(raterCount > 0);
  const [cad, setCad] = useState(cadence || 1);
  const [due, setDue] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 10 ? p : [...p, id]));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Statements</CardTitle>
          <CardDescription>
            {picked.length} of 5–10 chosen. We pre-selected the lowest-rated statements in your goals and growth areas. Others&apos; last average is shown for each.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {competencies.map((c) => (
            <fieldset key={c.key}>
              <legend className="mb-2 text-sm font-semibold">{c.name}</legend>
              <div className="space-y-1.5">
                {c.questions.map((q) => (
                  <label key={q.id} className="flex cursor-pointer items-start gap-3 rounded-md p-1.5 text-sm hover:bg-accent/50">
                    <input type="checkbox" className="mt-0.5 size-4" checked={picked.includes(q.id)} onChange={() => toggle(q.id)} disabled={!picked.includes(q.id) && picked.length >= 10} />
                    <span className="flex-1">{q.text}</span>
                    <span className="tabular-nums text-muted-foreground">{fmt(q.others)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who and when</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-start gap-3 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-0.5 size-4" checked={reuse} onChange={(e) => setReuse(e.target.checked)} disabled={raterCount === 0} />
            <span>
              <span className="font-medium">Ask the same {raterCount} people again</span>
              <span className="block text-muted-foreground">They get a fresh anonymous link. You can add or remove people before sending.</span>
            </span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="cadence">Remind me to run a pulse every</Label>
            <select id="cadence" value={cad} onChange={(e) => setCad(Number(e.target.value))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value={0}>Don&apos;t remind me</option>
              <option value={1}>1 month</option>
              <option value={2}>2 months</option>
              <option value={3}>3 months</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due">Raters have</Label>
            <select id="due" value={due} onChange={(e) => setDue(Number(e.target.value))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {[5, 7, 10, 14].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      <Button
        size="lg"
        disabled={pending || picked.length < 5}
        data-testid="create-pulse"
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await createPulseAction(sourceId, { questionIds: picked, reuseRaters: reuse, cadenceMonths: cad, dueInDays: due });
            if (!r.ok) return setError(r.error);
            router.push(`/assessments/${r.data!.id}/self`);
          })
        }
      >
        {pending ? "Creating…" : "Create pulse & rate myself"}
      </Button>
    </div>
  );
}
