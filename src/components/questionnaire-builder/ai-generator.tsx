"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Coins, Sparkles } from "lucide-react";
import { AI_QUESTIONNAIRE_PRICE_CENTS, formatPrice } from "@/lib/questionnaire";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateQuestionnaireAction } from "@/app/(app)/questionnaires/actions";

export function AIGenerator({ credits, defaultRole }: { credits: number; defaultRole: string }) {
  const [brief, setBrief] = useState({ purpose: "", role: defaultRole, audience: "", sections: 5, perSection: 4 });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const price = formatPrice(AI_QUESTIONNAIRE_PRICE_CENTS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> Tell us what you want feedback on
        </CardTitle>
        <CardDescription>
          AI writes a complete questionnaire of observable behaviours. It&apos;s saved as yours, and you can edit it for free afterwards. Costs 1 credit ({price}); you&apos;re only charged if generation succeeds.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="purpose">What do you want feedback on?</Label>
          <Textarea
            id="purpose"
            rows={4}
            value={brief.purpose}
            onChange={(e) => setBrief({ ...brief, purpose: e.target.value })}
            placeholder="e.g. I just became a first-time engineering manager of 6 people and want to know how I'm doing on 1:1s, delegation and running team rituals."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="role">Your role</Label>
            <Input id="role" value={brief.role} onChange={(e) => setBrief({ ...brief, role: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audience">Who will give feedback?</Label>
            <Input id="audience" value={brief.audience} onChange={(e) => setBrief({ ...brief, audience: e.target.value })} placeholder="e.g. my team and two peer managers" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sections">Number of sections</Label>
            <select id="sections" value={brief.sections} onChange={(e) => setBrief({ ...brief, sections: Number(e.target.value) })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {[3, 4, 5, 6, 7].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="per">Statements per section</Label>
            <select id="per" value={brief.perSection} onChange={(e) => setBrief({ ...brief, perSection: Number(e.target.value) })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {[3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3 text-sm">
          <Coins className="size-4" />
          <span data-testid="credit-balance">
            You have <strong>{credits}</strong> credit{credits === 1 ? "" : "s"}.
          </span>
          {credits < 1 && <span className="text-muted-foreground">Buying credits opens soon. Until then, building your own questionnaire is free.</span>}
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending || credits < 1}
            data-testid="generate-questionnaire"
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await generateQuestionnaireAction(brief);
                if (!r.ok) return setError(r.error);
                router.push(`/questionnaires/${r.data!.id}?generated=1`);
                router.refresh();
              })
            }
          >
            {pending ? "Writing your questionnaire… (up to 30 seconds)" : `Generate for 1 credit (${price})`}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/questionnaires/new">Build my own instead (free)</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
