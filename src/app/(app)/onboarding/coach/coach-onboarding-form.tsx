"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCoachOnboarding } from "./actions";

export function CoachOnboardingForm({ initial }: { initial: { displayName: string; brandName: string; website: string; clientsFocus: string } }) {
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="mt-6 space-y-4"
      data-testid="coach-onboarding"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await saveCoachOnboarding(s);
          if (!r.ok) return setError(r.error);
          router.push("/coach");
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="co-name">Your name (shown to clients)</Label>
        <Input id="co-name" value={s.displayName} onChange={(e) => setS({ ...s, displayName: e.target.value })} required maxLength={80} autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="co-brand">Practice or brand name (optional)</Label>
        <Input id="co-brand" value={s.brandName} onChange={(e) => setS({ ...s, brandName: e.target.value })} maxLength={60} placeholder="e.g. Lee Leadership Coaching" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="co-focus">Who you coach (optional)</Label>
        <Input id="co-focus" value={s.clientsFocus} onChange={(e) => setS({ ...s, clientsFocus: e.target.value })} maxLength={200} placeholder="e.g. First-time managers in tech" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="co-web">Website (optional)</Label>
        <Input id="co-web" type="url" value={s.website} onChange={(e) => setS({ ...s, website: e.target.value })} placeholder="https://…" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Setting up…" : "Open my coach workspace"}
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}
