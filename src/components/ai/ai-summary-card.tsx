"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";
import type { StoredAISummary } from "@/lib/services/ai";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { aiSummaryAction } from "@/app/(app)/assessments/ai-actions";

const badge = (s: StoredAISummary) =>
  s.generatedBy === "ai" ? `Written by AI (${s.modelId === "free" ? "standard model" : s.modelId})` : s.generatedBy === "mock" ? "Sample text — AI key not configured" : "Standard summary — AI was unavailable";

export function AISummaryCard({ assessmentId, summary, print = false }: { assessmentId: string; summary: StoredAISummary | null; print?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "error" | "warning"; text: string } | null>(null);
  const [version, setVersion] = useState<"standard" | "simple">("standard");
  const router = useRouter();
  const run = () =>
    start(async () => {
      setMsg(null);
      const r = await aiSummaryAction(assessmentId);
      if (!r.ok) setMsg({ tone: "error", text: r.error });
      else {
        if (r.data?.warning) setMsg({ tone: "warning", text: r.data.warning });
        router.refresh();
      }
    });

  if (!summary) {
    if (print) return null;
    return (
      <Card className="no-print border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5 sm:pt-6">
          <div>
            <p className="flex items-center gap-2 font-medium">
              <Sparkles className="size-4 text-primary" /> Get an AI summary of your feedback
            </p>
            <p className="text-sm text-muted-foreground">Uses only your anonymised scores and comment themes. Never shared.</p>
          </div>
          <Button onClick={run} disabled={pending} data-testid="ai-summary">
            {pending ? "Writing…" : "Write my AI summary"}
          </Button>
          {msg && <Alert tone={msg.tone} className="w-full">{msg.text}</Alert>}
        </CardContent>
      </Card>
    );
  }

  const simple = !print && version === "simple" && summary.simple ? summary.simple : null;
  const shown = simple ?? summary;
  return (
    <Card className="avoid-break border-primary/30 bg-accent/30" data-testid="ai-summary-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="size-4 text-primary" /> AI summary
          </CardTitle>
          {!print && (
            <div className="flex flex-wrap items-center gap-2">
              {summary.simple && (
                <div role="group" aria-label="Summary wording" className="inline-flex rounded-md border bg-background p-0.5" data-testid="summary-version">
                  {(
                    [
                      ["standard", "Standard"],
                      ["simple", "Simplified"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={version === v}
                      onClick={() => setVersion(v)}
                      className={`h-8 rounded px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${version === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={run} disabled={pending} aria-label="Regenerate AI summary">
                <RefreshCw className={pending ? "animate-spin" : ""} /> {pending ? "Writing…" : "Regenerate"}
              </Button>
            </div>
          )}
        </div>
        <p className="leading-relaxed" data-testid="ai-summary-text">{shown.summary}</p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["What others value", shown.strengths],
            ["Where to grow", shown.growth],
          ] as const
        ).map(([title, items]) => (
          <div key={title}>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
            <ul className="space-y-2 text-sm">
              {items.map((x, i) => (
                <li key={i}>
                  <span className="font-medium">{x.competency}:</span> {x.insight}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground sm:col-span-2">
          {badge(summary)} · {new Date(summary.generatedAt).toLocaleDateString()}. AI can be wrong — check it against your scores.
          {!print && !summary.simple && " Regenerate to get a Simplified version too."}
        </p>
        {msg && <Alert tone={msg.tone} className="sm:col-span-2">{msg.text}</Alert>}
      </CardContent>
    </Card>
  );
}
