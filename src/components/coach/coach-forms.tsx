"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addNoteAction, aiBriefAction, deleteMeetingAction, deleteNoteAction, saveCoachProfileAction, scheduleMeetingAction } from "@/app/(app)/coach/actions";

export function CoachProfileForm({ initial, setup = false }: { initial: { displayName: string; brandName: string; brandColor: string; website: string }; setup?: boolean }) {
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      data-testid="coach-profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        start(async () => {
          const r = await saveCoachProfileAction(s);
          if (!r.ok) return setError(r.error);
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cp-name">Your name (shown to clients)</Label>
          <Input id="cp-name" value={s.displayName} onChange={(e) => setS({ ...s, displayName: e.target.value })} required maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cp-brand">Practice or brand name (optional)</Label>
          <Input id="cp-brand" value={s.brandName} onChange={(e) => setS({ ...s, brandName: e.target.value })} maxLength={60} placeholder="e.g. Lee Leadership Coaching" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cp-color">Brand colour</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick brand colour"
              value={s.brandColor || "#0f766e"}
              onChange={(e) => setS({ ...s, brandColor: e.target.value })}
              className="h-10 w-12 rounded-md border border-input bg-background p-1"
            />
            <Input id="cp-color" value={s.brandColor} onChange={(e) => setS({ ...s, brandColor: e.target.value })} placeholder="#0f766e" className="w-32 font-mono" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cp-web">Website (optional)</Label>
          <Input id="cp-web" type="url" value={s.website} onChange={(e) => setS({ ...s, website: e.target.value })} placeholder="https://…" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Your brand name and colour appear on the reports and PDFs of clients who leave “Show my coach&apos;s branding” switched on.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : setup ? "Create coach workspace" : "Save profile"}
      </Button>
      {saved && !setup && <span className="ml-2 text-sm text-muted-foreground" role="status">Saved.</span>}
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}

export function NotesPanel({ clientId, notes }: { clientId: string; notes: { id: string; body: string; createdAt: string }[] }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      after?.();
      router.refresh();
    });
  return (
    <div className="space-y-3" data-testid="coach-notes">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addNoteAction(clientId, body), () => setBody(""));
        }}
      >
        <Label htmlFor="note-body">New note (only you can see notes)</Label>
        <Textarea id="note-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} />
        <Button type="submit" disabled={pending || !body.trim()}>
          Add note
        </Button>
      </form>
      {error && <Alert tone="error">{error}</Alert>}
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-md border p-3 text-sm" data-testid="coach-note">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{new Date(n.createdAt).toLocaleString()}</span>
              <Button variant="ghost" size="icon-sm" aria-label="Delete note" onClick={() => confirm("Delete this note?") && run(() => deleteNoteAction(clientId, n.id))}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <p className="whitespace-pre-wrap">{n.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MeetingsPanel({ clientId, meetings }: { clientId: string; meetings: { id: string; scheduledAt: string; topic: string }[] }) {
  const [at, setAt] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      after?.();
      router.refresh();
    });
  return (
    <div className="space-y-3" data-testid="coach-meetings">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // datetime-local has no zone: interpret it in the coach's browser time zone.
          run(() => scheduleMeetingAction(clientId, { scheduledAt: new Date(at).toISOString(), topic }), () => {
            setAt("");
            setTopic("");
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="mt-at">Next session</Label>
          <Input id="mt-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mt-topic">Topic (optional, the client sees it)</Label>
          <Input id="mt-topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} />
        </div>
        <Button type="submit" disabled={pending}>
          Schedule
        </Button>
      </form>
      {error && <Alert tone="error">{error}</Alert>}
      <ul className="space-y-1 text-sm">
        {meetings.map((m) => (
          <li key={m.id} className="flex items-center gap-2">
            <span>{new Date(m.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
            {m.topic && <span className="text-muted-foreground">· {m.topic}</span>}
            <Button variant="ghost" size="icon-sm" aria-label="Cancel session" onClick={() => run(() => deleteMeetingAction(clientId, m.id))}>
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AIBriefButton({ clientId }: { clientId: string }) {
  const [res, setRes] = useState<{ summary: string; questions: string[]; generatedBy: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        data-testid="ai-brief"
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await aiBriefAction(clientId);
            if (!r.ok) return setError(r.error);
            setRes(r.data!);
          })
        }
      >
        <Sparkles /> {pending ? "Writing…" : "Write with AI"}
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
      {res && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm" data-testid="ai-brief-result">
          <p>{res.summary}</p>
          <ul className="list-disc space-y-1 pl-5">
            {res.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{res.generatedBy === "ai" ? "Written by AI from the shared scores. Check before using." : "Standard brief (AI unavailable right now)."}</p>
        </div>
      )}
    </div>
  );
}
