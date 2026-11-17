"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/components/ui/field-classes";
import {
  FILL_IN_HELP,
  FILL_INS,
  MAX_MESSAGE,
  MAX_NOTE,
  renderReminder,
  TONE_TEMPLATES,
  TONES,
  type Tone,
} from "@/lib/reminders/rules";
import {
  cancelQueuedReminderAction,
  rewriteReminderAction,
  sendRemindersAction,
  setPersonalNoteAction,
} from "@/app/(app)/assessments/[id]/reminder-actions";

export type PanelRater = {
  id: string;
  name: string | null;
  email: string | null;
  group: string;
  status: "INVITED" | "STARTED" | "SUBMITTED" | "DECLINED";
  reminders: number;
  lastRemindedAt: string | null;
  queued: boolean;
  note: string | null;
  canRemind: boolean;
  reason: string | null;
  until: string | null;
};

export type PanelData = {
  assessmentId: string;
  subjectName: string;
  dueAt: string | null;
  inWindow: boolean;
  nextWindow: string;
  tone: Tone;
  template: string;
  raters: PanelRater[];
  history: {
    at: string;
    rater: string;
    kind: string;
    outcome: string;
    reason: string | null;
  }[];
};

const FILTERS = [
  { key: "eligible", label: "Can be reminded" },
  { key: "not_started", label: "Not started" },
  { key: "started", label: "Started, not finished" },
  { key: "all", label: "Everyone" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const STATUS: Record<PanelRater["status"], string> = {
  INVITED: "Not started",
  STARTED: "In progress",
  SUBMITTED: "Responded",
  DECLINED: "Declined",
};
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const label = (r: PanelRater) => r.name || r.email || "Rater";

/** One screen to remind raters politely: pick people, edit one message, preview, send. */
export function RemindersPanel({ data }: { data: PanelData }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("eligible");
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(data.raters.filter((r) => r.canRemind).map((r) => r.id)),
  );
  const [tone, setTone] = useState<Tone>(data.tone);
  const [message, setMessage] = useState(data.template);
  const [save, setSave] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{
    tone: "success" | "error" | "info";
    text: string;
    skipped?: { name: string; reason: string }[];
  } | null>(null);
  const [busy, start] = useTransition();

  const shown = useMemo(
    () =>
      data.raters.filter((r) =>
        filter === "all"
          ? true
          : filter === "eligible"
            ? r.canRemind
            : filter === "not_started"
              ? r.status === "INVITED"
              : r.status === "STARTED",
      ),
    [data.raters, filter],
  );
  const chosen = data.raters.filter((r) => picked.has(r.id) && r.canRemind);
  const sample = chosen[0] ?? data.raters.find((r) => r.canRemind) ?? null;
  const dueAt = data.dueAt ? new Date(data.dueAt) : null;
  const preview = sample
    ? renderReminder(message, {
        raterName: sample.name,
        subjectName: data.subjectName,
        dueAt,
      })
    : null;

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const selectShown = (on: boolean) => {
    const next = new Set(picked);
    for (const r of shown) {
      if (!r.canRemind) continue;
      if (on) next.add(r.id);
      else next.delete(r.id);
    }
    setPicked(next);
  };

  const send = () =>
    start(async () => {
      setResult(null);
      const r = await sendRemindersAction(data.assessmentId, {
        inviteIds: chosen.map((c) => c.id),
        message,
        tone,
        saveTemplate: save,
      });
      if (!r.ok) return setResult({ tone: "error", text: r.error });
      const d = r.data!;
      const parts = [
        d.sent && `Sent to ${d.sent}`,
        d.queued &&
          `${d.queued} queued for ${d.sendsAt ? when(new Date(d.sendsAt).toISOString()) : "the next working day"} (working hours)`,
      ].filter(Boolean);
      setResult({
        tone: d.sent || d.queued ? "success" : "info",
        text: parts.join(". ") || "No one was reminded.",
        skipped: d.skipped,
      });
      setPicked(new Set());
      router.refresh();
    });

  return (
    <div className="space-y-6" data-testid="reminders-panel">
      {/* 1. Who */}
      <div className="space-y-3">
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Show raters"
        >
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              type="button"
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
          <span className="ml-auto flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => selectShown(true)}
            >
              Select all shown
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => selectShown(false)}
            >
              Clear
            </Button>
          </span>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-3 py-2 font-medium">Rater</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Reminders</th>
                <th className="px-3 py-2 font-medium">Personal line</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.id}
                  className="border-t align-top"
                  data-testid="reminder-row"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-4"
                      aria-label={`Remind ${label(r)}`}
                      checked={picked.has(r.id) && r.canRemind}
                      disabled={!r.canRemind}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{label(r)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.group}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        r.status === "SUBMITTED"
                          ? "success"
                          : r.status === "STARTED"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {STATUS[r.status]}
                    </Badge>
                    {!r.canRemind && r.reason && (
                      <span
                        className="mt-1 block text-xs text-muted-foreground"
                        data-testid="reminder-reason"
                      >
                        {r.reason}
                        {r.until && ` until ${when(r.until)}`}
                      </span>
                    )}
                    {r.queued && (
                      <button
                        type="button"
                        className="mt-1 block text-xs underline"
                        onClick={() =>
                          start(async () => {
                            await cancelQueuedReminderAction(
                              data.assessmentId,
                              r.id,
                            );
                            router.refresh();
                          })
                        }
                      >
                        Cancel queued reminder
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.reminders}/3
                    {r.lastRemindedAt && (
                      <span className="block">
                        last {when(r.lastRemindedAt)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {noteFor === r.id ? (
                      <form
                        className="flex gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          start(async () => {
                            await setPersonalNoteAction(
                              data.assessmentId,
                              r.id,
                              note,
                            );
                            setNoteFor(null);
                            router.refresh();
                          });
                        }}
                      >
                        <Input
                          aria-label={`Personal line for ${label(r)}`}
                          maxLength={MAX_NOTE}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          className="h-8 text-xs"
                        />
                        <Button size="sm" type="submit" disabled={busy}>
                          Save
                        </Button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="text-left underline-offset-2 hover:underline"
                        onClick={() => {
                          setNoteFor(r.id);
                          setNote(r.note ?? "");
                        }}
                      >
                        {r.note ? (
                          <span className="text-foreground">“{r.note}”</span>
                        ) : (
                          <span className="text-muted-foreground">
                            Add a line
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-muted-foreground">
                    No one here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Each person gets at most 3 reminders, 2 days apart, including the
          automatic ones. Emails go out on weekdays in working hours
          {data.inWindow
            ? "."
            : `; anything you send now goes out ${when(data.nextWindow)}.`}
        </p>
      </div>

      {/* 2. Message */}
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
                    if (r.data!.note)
                      setResult({ tone: "info", text: r.data!.note });
                  } else setResult({ tone: "error", text: r.error });
                })
              }
            >
              <Sparkles /> Rewrite with AI
            </Button>
          </div>
          <Label htmlFor="reminder-message">Message</Label>
          <Textarea
            id="reminder-message"
            rows={9}
            maxLength={MAX_MESSAGE}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
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
            <input
              type="checkbox"
              className="size-4"
              checked={save}
              onChange={(e) => setSave(e.target.checked)}
            />
            Save this message for my next 360s
          </label>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">
            Preview{sample ? ` for ${label(sample)}` : ""}
          </p>
          <div
            className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm"
            data-testid="reminder-preview"
          >
            {preview ? (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  From: {data.subjectName} via Mirror · Replies go to you
                  <br />
                  Subject: Reminder: {data.subjectName} would value your
                  feedback
                </p>
                {preview}
                {sample?.note && `\n\n${sample.note}`}
                <span className="mt-2 block text-xs text-muted-foreground">
                  + their personal anonymous link and a line saying answers are
                  never shown individually.
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                No one can be reminded right now.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Send */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={send}
          disabled={busy || chosen.length === 0}
          data-testid="send-reminders"
        >
          {busy
            ? "Sending…"
            : chosen.length
              ? `Send reminder to ${chosen.length} ${chosen.length === 1 ? "person" : "people"}`
              : "Pick people to remind"}
        </Button>
      </div>
      {result && (
        <Alert tone={result.tone} data-testid="reminder-result">
          {result.text}
          {result.skipped && result.skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  Skipped {s.name}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {/* 4. History */}
      {data.history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            Reminder history ({data.history.length})
          </summary>
          <ul
            className="mt-2 divide-y rounded-md border"
            data-testid="reminder-history"
          >
            {data.history.map((h, i) => (
              <li
                key={i}
                className="flex flex-wrap justify-between gap-2 px-3 py-1.5"
              >
                <span>
                  {h.rater} · {h.kind === "AUTO" ? "automatic" : "by you"}
                </span>
                <span className="text-muted-foreground">
                  {h.outcome.toLowerCase()}
                  {h.reason ? ` (${h.reason})` : ""} · {when(h.at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
