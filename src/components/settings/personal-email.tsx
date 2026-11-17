"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removePersonalEmailAction, requestPersonalEmailAction, verifyPersonalEmailAction } from "@/app/(app)/settings/personal-email-actions";

type Msg = { tone: "success" | "error" | "info"; text: string } | null;

/** Phase 11e: add or remove a personal sign-in email. */
export function PersonalEmailForm({ current, pending }: { current: string | null; pending: string | null }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3" data-testid="personal-email">
      {current && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            Personal sign-in email: <span className="font-medium" data-testid="personal-email-current">{current}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await removePersonalEmailAction();
                setMsg(r.ok ? { tone: "success", text: "Removed." } : { tone: "error", text: r.error });
                router.refresh();
              })
            }
          >
            Remove
          </Button>
        </div>
      )}
      {pending && <p className="text-sm text-muted-foreground">Waiting for you to confirm {pending}. Check that inbox for the link.</p>}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await requestPersonalEmailAction(email);
            setMsg(r.ok ? { tone: "info", text: `We sent a confirmation link to ${email}.` } : { tone: "error", text: r.error });
            if (r.ok) setEmail("");
            router.refresh();
          });
        }}
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="personal-email-input">{current ? "Change personal email" : "Personal email"}</Label>
          <Input id="personal-email-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send confirmation link"}
        </Button>
      </form>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}

/** The confirmation page's button (a POST, so link scanners can't confirm by visiting). */
export function ConfirmPersonalEmail({ token }: { token: string }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-3">
      <Button
        data-testid="confirm-personal-email"
        disabled={busy || msg?.tone === "success"}
        onClick={() =>
          start(async () => {
            const r = await verifyPersonalEmailAction(token);
            setMsg(r.ok ? { tone: "success", text: `Confirmed. You can now sign in with ${r.data!.email} too.` } : { tone: "error", text: r.error });
          })
        }
      >
        {busy ? "Confirming…" : "Confirm personal email"}
      </Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}
