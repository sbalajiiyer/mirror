"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Send, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addRatersAction, closeAction, launchAction, removeInviteAction, reopenAction } from "../actions";

export function LifecycleActions({
  assessmentId,
  status,
  submitted,
  invites,
  min,
}: {
  assessmentId: string;
  status: "READY" | "COLLECTING" | "CLOSED";
  submitted: number;
  invites: number;
  min: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { tone: "success", text: success } : { tone: "error", text: r.error ?? "Failed" });
      if (r.ok) {
        router.refresh();
        after?.();
      }
    });

  return (
    <Card>
      {status === "READY" && (
        <>
          <CardHeader>
            <CardTitle>Self-assessment locked — send your invites</CardTitle>
            <CardDescription>{invites} people will get an email with their personal, anonymous link. Reminders go out automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => run(() => launchAction(assessmentId), "Invites sent.")} disabled={pending} data-testid="launch">
              <Send /> {pending ? "Sending…" : "Send invites"}
            </Button>
          </CardContent>
        </>
      )}
      {status === "COLLECTING" && (
        <>
          <CardHeader>
            <CardTitle>Collecting feedback</CardTitle>
            <CardDescription>
              Close the 360 when you&apos;re ready to see your report. After closing, no more responses are accepted.
              {submitted < min && ` You need at least ${min} responses before results can be shown.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant={submitted >= min ? "default" : "outline"}
              disabled={pending}
              data-testid="close"
              onClick={() => {
                if (!confirm(submitted < min ? `Only ${submitted} responses so far — results won't be visible. Close anyway?` : "Close and generate your report? Raters will no longer be able to respond.")) return;
                run(() => closeAction(assessmentId), "Closed.", () => router.push(`/assessments/${assessmentId}/report`));
              }}
            >
              {pending ? "Generating…" : "Close & generate report"}
            </Button>
          </CardContent>
        </>
      )}
      {status === "CLOSED" && (
        <CardContent className="pt-6">
          <Button variant="outline" disabled={pending} onClick={() => run(() => reopenAction(assessmentId), "Reopened.")}>
            Reopen and invite more people
          </Button>
        </CardContent>
      )}
      {msg && (
        <div className="px-6 pb-6">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}
    </Card>
  );
}

export function AddRaters({ assessmentId, groupId, groupName }: { assessmentId: string; groupId: string; groupName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open)
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus /> Add someone to {groupName}
      </Button>
    );
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addRatersAction(assessmentId, groupId, [{ name, email }]);
          if (!r.ok) return setErr(r.error);
          setErr(null);
          setName("");
          setEmail("");
          router.refresh();
        });
      }}
    >
      <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
      <Input placeholder="email@example.com" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
      <Button type="submit" variant="secondary" disabled={pending}>
        Add
      </Button>
      {err && <p className="text-xs text-destructive sm:self-center">{err}</p>}
    </form>
  );
}

export function RemoveInvite({ assessmentId, inviteId }: { assessmentId: string; inviteId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      aria-label="Remove rater"
      disabled={pending}
      className="text-muted-foreground hover:text-foreground"
      onClick={() =>
        start(async () => {
          if (!confirm("Remove this person? Their link will stop working.")) return;
          await removeInviteAction(assessmentId, inviteId);
          router.refresh();
        })
      }
    >
      <X className="size-4" />
    </button>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <Copy /> {copied ? "Copied" : "Copy"}
    </Button>
  );
}
