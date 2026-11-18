"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/components/ui/field-classes";
import { FILL_IN_HELP, FILL_INS, MAX_MESSAGE, MAX_NOTE, renderReminder, TONE_TEMPLATES, TONES, type Tone } from "@/lib/reminders/rules";
import { cancelQueuedRemindersAction, rewriteReminderAction, sendRemindersAction, setPersonalNoteAction } from "@/app/(app)/assessments/[id]/reminder-actions";

/** A rater as the person asking for feedback sees them: no status, ever. */
export type PanelRater = { id: string; name: string | null; email: string | null; group: string; note: string | null };

export type PanelData = {
  assessmentId: string;
  subjectName: string;
  dueAt: string | null;
  inWindow: boolean;
  nextWindow: string;
  tone: Tone;
  template: string;
  raters: PanelRater[];
  /** When the next manual round is allowed (null = now). */
  nextManualAt: string | null;
  queued: boolean;
  history: { at: string; kind: "AUTO" | "MANUAL"; outcome: "SENT" | "QUEUED" }[];
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const label = (r: PanelRater) => r.name || r.email || "Rater";

/**
 * One screen to remind raters politely, without seeing who has answered: write one message and it
 * goes to everyone who hasn't answered yet. Personal lines can be added for anyone.
 */
export function RemindersPanel({ data }: { data: PanelData }) {
  const router = useRouter();
  const [tone, setTone] = useState<Tone>(data.tone);
  const [message, setMessage] = useState(data.template);
  const [save, setSave] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [busy, start] = useTransition();
  const sample = data.raters[0] ?? null;
  const preview = sample ? renderReminder(message, { raterName: sample.name, subjectName: data.subjectName, dueAt: data.dueAt ? new Date(data.dueAt) : null }) : null;
  const blocked = !!data.nextManualAt;

  const send = () =>
    start(async () => {
      setResult(null);
      const r = await sendRemindersAction(data.assessmentId, { message, tone, saveTemplate: save });
      if (!r.ok) return setResult({ tone: "error", text: r.error });
      const d = r.data!;
      setResult({
        tone: "success",
        text:
          d.when === "now"
            ? "Done. Everyone who hasn't answered yet gets your reminder now."
            : `Queued. Everyone who hasn't answered yet gets your reminder ${d.sendsAt ? when(new Date(d.sendsAt).toISOString()) : "on the next working day"}.`,
      });
      router.refresh();
    });

  return (
    <div className="space-y-6" data-testid="reminders-panel">
      <Alert tone="info" className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          To keep feedback anonymous, you don&apos;t see who has answered. Your reminder goes to everyone who hasn&apos;t answered yet; people who already
          answered never get it.
        </span>
      </Alert>

      {/* 1. Message */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="reminder-tone">Tone</Label>
              <select
                id="reminder-tone"
                className={selectClass}
                value={tone}
                onChange={(e) => {
                  const t = e.target.value as Tone;
                  setTone(t);
                  setMessage(TONE_TEMPLATES[t]);
                }}
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const r = await rewriteReminderAction(message, tone);
                  if (r.ok) {
                    setMessage(r.data!.message);
                    if (r.data!.note) setResult({ tone: "info", text: r.data!.note });
                  } else setResult({ tone: "error", text: r.error });
                })
              }
            >
              <Sparkles /> Rewrite with AI
            </Button>
          </div>
          <Label htmlFor="reminder-message">Message</Label>
          <Textarea id="reminder-message" rows={9} maxLength={MAX_MESSAGE} value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="text-xs text-muted-foreground">
            <p>Fill-ins (click to add):</p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {FILL_INS.map((f) => (
                <li key={f}>
                  <button
                    type="button"
                    title={FILL_IN_HELP[f]}
                    className="font-mono underline-offset-2 hover:underline"
                    onClick={() => setMessage((m) => `${m}${m.endsWith(" ") ? "" : " "}${f}`)}
                  >
                    {f}
                  </button>{" "}
                  <span>{FILL_IN_HELP[f].toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={save} onChange={(e) => setSave(e.target.checked)} />
            Save this message for my next 360s
          </label>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Preview{sample ? ` for ${label(sample)}` : ""}</p>
          <div className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm" data-testid="reminder-preview">
            {preview ? (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  From: {data.subjectName} via Mirror · Replies go to you
                  <br />
                  Subject: Reminder: {data.subjectName} would value your feedback
                </p>
                {preview}
                {sample?.note && `\n\n${sample.note}`}
                <span className="mt-2 block text-xs text-muted-foreground">+ their personal anonymous link and a line saying answers are never shown individually.</span>
              </>
            ) : (
              <span className="text-muted-foreground">No one to remind.</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Send */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={send} disabled={busy || blocked || data.queued} data-testid="send-reminders">
            {busy ? "Sending…" : "Remind everyone who hasn't answered"}
          </Button>
          {data.queued && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  await cancelQueuedRemindersAction(data.assessmentId);
                  router.refresh();
                })
              }
            >
              Cancel the queued reminder
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground" data-testid="reminder-rules">
          {blocked
            ? `You sent a reminder recently. The next one can go ${when(data.nextManualAt!)}.`
            : data.queued
              ? `A reminder is queued for ${when(data.nextWindow)}.`
              : "One reminder from you every 2 days. Each person gets at most 3 in total, including the automatic ones."}{" "}
          Emails go out on weekdays in working hours{data.inWindow ? "." : `; anything you send now goes out ${when(data.nextWindow)}.`}
        </p>
      </div>
      {result && (
        <Alert tone={result.tone} data-testid="reminder-result">
          {result.text}
        </Alert>
      )}

      {/* 3. Personal lines */}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Personal lines ({data.raters.filter((r) => r.note).length} added)</summary>
        <p className="mt-2 text-xs text-muted-foreground">A line for one person, added to their invitation (if not sent yet) and to any reminder they get.</p>
        <ul className="mt-2 divide-y rounded-md border">
          {data.raters.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="reminder-row">
              <span className="min-w-0">
                <span className="font-medium">{label(r)}</span> <span className="text-xs text-muted-foreground">{r.group}</span>
              </span>
              {noteFor === r.id ? (
                <form
                  className="flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    start(async () => {
                      await setPersonalNoteAction(data.assessmentId, r.id, note);
                      setNoteFor(null);
                      router.refresh();
                    });
                  }}
                >
                  <Input aria-label={`Personal line for ${label(r)}`} maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} className="h-8 text-xs" />
                  <Button size="sm" type="submit" disabled={busy}>
                    Save
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  className="text-left text-xs underline-offset-2 hover:underline"
                  onClick={() => {
                    setNoteFor(r.id);
                    setNote(r.note ?? "");
                  }}
                >
                  {r.note ? <span className="text-foreground">“{r.note}”</span> : <span className="text-muted-foreground">Add a line</span>}
                </button>
              )}
            </li>
          ))}
        </ul>
      </details>

      {/* 4. History: rounds only, never names or counts */}
      {data.history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Reminder history ({data.history.length})</summary>
          <ul className="mt-2 divide-y rounded-md border" data-testid="reminder-history">
            {data.history.map((h, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-1.5">
                <span>{h.kind === "AUTO" ? "Automatic reminder" : "Your reminder"}</span>
                <span className="text-muted-foreground">
                  {h.outcome === "QUEUED" ? "queued" : "sent"} · {when(h.at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
