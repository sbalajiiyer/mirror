"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { saveAISettingsAction } from "../assessments/ai-actions";

type Model = { id: string; label: string; description: string; tier: "free" | "premium"; priceMicrosPer1k: number; available: boolean };

export function SettingsForm({
  models,
  initial,
  usage,
}: {
  models: Model[];
  initial: { aiModel: string; learningStyle: string | null; feedbackTone: string };
  usage: { calls: number; premiumCalls: number; costUsd: number };
}) {
  const [v, setV] = useState({ ...initial, learningStyle: initial.learningStyle ?? "" });
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveAISettingsAction({ ...v, learningStyle: v.learningStyle || null });
          setMsg(r.ok ? { tone: "success", text: "Saved." } : { tone: "error", text: r.error });
        });
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>AI model</CardTitle>
          <CardDescription>Used for your report summaries, development plans and suggestions. Only anonymised scores and comment themes are sent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3" role="radiogroup" aria-label="AI model">
          {models.map((m) => (
            <label
              key={m.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4",
                v.aiModel === m.id && "border-primary bg-accent ring-1 ring-primary",
                !m.available && "cursor-not-allowed opacity-60",
              )}
            >
              <input type="radio" name="model" className="mt-1" disabled={!m.available} checked={v.aiModel === m.id} onChange={() => setV({ ...v, aiModel: m.id })} />
              <span className="flex-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {m.label}
                  {m.tier === "free" ? <Badge variant="success">Free</Badge> : <Badge variant="secondary">Pay per use</Badge>}
                  {!m.available && <Badge variant="outline">Coming soon</Badge>}
                </span>
                <span className="block text-sm text-muted-foreground">{m.description}</span>
                {m.tier === "premium" && (
                  <span className="block text-xs text-muted-foreground">
                    About ${((m.priceMicrosPer1k * 4) / 1_000_000).toFixed(2)} per summary or plan (${(m.priceMicrosPer1k / 1_000_000).toFixed(3)} per 1,000 tokens).
                  </span>
                )}
              </span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            This month: {usage.calls} AI requests{usage.premiumCalls ? `, ${usage.premiumCalls} premium (≈ $${usage.costUsd.toFixed(2)})` : ""}. Premium billing starts when payments launch; until then usage is only metered.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personalisation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tone">Tone of AI feedback</Label>
            <select id="tone" value={v.feedbackTone} onChange={(e) => setV({ ...v, feedbackTone: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="direct">Direct</option>
              <option value="balanced">Balanced</option>
              <option value="gentle">Gentle</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="learning">How you like to learn</Label>
            <select id="learning" value={v.learningStyle} onChange={(e) => setV({ ...v, learningStyle: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">No preference</option>
              <option value="reading">Reading</option>
              <option value="video">Videos & talks</option>
              <option value="practice">Hands-on practice</option>
              <option value="conversation">Conversations & mentoring</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
