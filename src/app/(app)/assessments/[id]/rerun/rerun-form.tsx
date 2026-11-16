"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rerunSurveyAction } from "../../progress-actions";

export function RerunForm({ sourceId, raterCount, defaultLabel }: { sourceId: string; raterCount: number; defaultLabel: string }) {
  const [label, setLabel] = useState(defaultLabel);
  const [reuse, setReuse] = useState(raterCount > 0);
  const [due, setDue] = useState(14);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card>
      <CardContent className="space-y-5 pt-5 sm:pt-6">
        <div className="space-y-1.5">
          <Label htmlFor="label">Session name</Label>
          <Input id="label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Spring 2027, After the reorg" />
          <p className="text-xs text-muted-foreground">Helps you tell sessions apart in trends and comparisons. You can rename it later.</p>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4" checked={reuse} onChange={(e) => setReuse(e.target.checked)} disabled={raterCount === 0} />
          <span>
            <span className="font-medium">Ask the same {raterCount} people again</span>
            <span className="block text-muted-foreground">Each gets a fresh anonymous link. You can add or remove people before sending.</span>
          </span>
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="due">Raters have</Label>
          <select id="due" value={due} onChange={(e) => setDue(Number(e.target.value))} className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm">
            {[7, 10, 14, 21].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <Button
          size="lg"
          disabled={pending}
          data-testid="rerun"
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await rerunSurveyAction(sourceId, { sessionLabel: label, reuseRaters: reuse, dueInDays: due });
              if (!r.ok) return setError(r.error);
              router.push(`/assessments/${r.data!.id}/self`);
            })
          }
        >
          {pending ? "Creating…" : "Create session & rate myself"}
        </Button>
      </CardContent>
    </Card>
  );
}
