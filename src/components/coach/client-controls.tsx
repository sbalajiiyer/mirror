"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import { inviteClientAction } from "@/app/(app)/coach/actions";
import { endLinkAction, inviteCoachAction, respondToInviteAction, respondToInviteTokenAction, updateSharingAction } from "@/app/(app)/coaching/actions";

/** Small helper: run an action, show its error, refresh on success. */
function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      after?.();
      router.refresh();
    });
  return { pending, error, run };
}

export function EmailInviteForm({ label, button, testId, onSubmit }: { label: string; button: string; testId: string; onSubmit: "coach" | "client" }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const { pending, error, run } = useAction();
  return (
    <form
      className="space-y-2"
      data-testid={testId}
      onSubmit={(e) => {
        e.preventDefault();
        setSent(null);
        run(
          async () => {
            return onSubmit === "coach" ? inviteCoachAction(email) : inviteClientAction(email);
          },
          () => {
            setSent(email);
            setEmail("");
          },
        );
      }}
    >
      <Label htmlFor={`${testId}-email`}>{label}</Label>
      <div className="flex flex-wrap gap-2">
        <Input id={`${testId}-email`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="max-w-xs" />
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : button}
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {sent && <Alert tone="success">Invitation sent to {sent}.</Alert>}
    </form>
  );
}

export function RespondButtons({ linkId, token, next = "/coaching" }: { linkId?: string; token?: string; next?: string }) {
  const { pending, error, run } = useAction();
  const router = useRouter();
  const respond = (accept: boolean) =>
    run(
      () => (token ? respondToInviteTokenAction(token, accept) : respondToInviteAction(linkId!, accept)),
      () => token && router.push(next),
    );
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button onClick={() => respond(true)} disabled={pending} data-testid="accept-invite">
          Accept
        </Button>
        <Button variant="outline" onClick={() => respond(false)} disabled={pending}>
          Decline
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

export function EndLinkButton({ linkId, label = "Stop coaching", confirmText }: { linkId: string; label?: string; confirmText: string }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => confirm(confirmText) && run(() => endLinkAction(linkId))}>
        {label}
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </>
  );
}

type Sharing = { shareReports: boolean; shareComments: boolean; shareGoals: boolean; sharePlan: boolean; showBranding: boolean };

const OPTIONS: { key: keyof Sharing; label: string; help: string }[] = [
  { key: "shareReports", label: "Reports and progress", help: "Scores, charts and comment themes from your closed sessions (never individual raters' answers)." },
  { key: "shareComments", label: "Rater comments (word for word)", help: "The written comments in your reports. Off by default." },
  { key: "shareGoals", label: "Goals", help: "Your goals and how close you are to them." },
  { key: "sharePlan", label: "Development plan", help: "Your latest development plan and its actions." },
  { key: "showBranding", label: "Show my coach's branding on my reports", help: "Adds “Prepared with …” to your reports and PDFs." },
];

export function SharingPanel({ linkId, initial, coachName }: { linkId: string; initial: Sharing; coachName: string }) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useAction();
  return (
    <form
      className="space-y-3"
      data-testid="sharing-panel"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(() => updateSharingAction(linkId, s), () => setSaved(true));
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What {coachName} can see</legend>
        <p className="text-xs text-muted-foreground">Always visible to your coach: your name and email, and the status of your 360s (open or closed, how many people have responded).</p>
        {OPTIONS.map((o) => {
          const disabled = o.key === "shareComments" && !s.shareReports;
          return (
            <label key={o.key} className={`flex items-start gap-2 text-sm ${disabled ? "opacity-60" : ""}`}>
              <input type="checkbox" className="mt-1 size-4" checked={s[o.key] && !disabled} disabled={disabled} onChange={(e) => setS({ ...s, [o.key]: e.target.checked })} />
              <span>
                <span className="font-medium">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.help}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save sharing"}
      </Button>
      {saved && <span className="ml-2 text-sm text-muted-foreground" role="status">Saved.</span>}
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}
