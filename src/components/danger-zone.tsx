"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A red-bordered group of destructive actions, GitHub-style. */
export function DangerZone({ children, title = "Danger zone" }: { children: React.ReactNode; title?: string }) {
  return (
    <section aria-labelledby="danger-h" className="rounded-xl border border-destructive/60" data-testid="danger-zone">
      <h2 id="danger-h" className="flex items-center gap-2 border-b border-destructive/40 px-5 py-3 sm:px-6 text-base font-semibold text-destructive">
        <AlertTriangle className="size-4" aria-hidden /> {title}
      </h2>
      <div className="divide-y divide-destructive/20">{children}</div>
    </section>
  );
}

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

/**
 * One destructive action. The button opens a confirmation that names what goes and needs the
 * exact phrase typed before the action can run.
 */
export function DangerAction({
  id,
  title,
  description,
  removes,
  phrase,
  phraseHint,
  button,
  action,
  done,
  redirectTo,
}: {
  id: string;
  title: string;
  description: string;
  removes?: string[];
  /** What must be typed to confirm (compared ignoring case). */
  phrase: string;
  phraseHint?: string;
  button: string;
  action: (confirm: string) => Promise<Result>;
  /** Message after success (when the page stays); {count} is replaced by the result's count. */
  done?: string;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const matches = text.trim().toLowerCase() === phrase.trim().toLowerCase();
  return (
    <div className="space-y-3 px-5 py-4 sm:px-6" data-testid={`danger-${id}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-medium">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {!open && (
          <Button variant="outline" className="shrink-0 border-destructive/60 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setOpen(true)}>
            {button}
          </Button>
        )}
      </div>
      {open && (
        <form
          className="space-y-3 rounded-lg bg-destructive/5 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!matches) return;
            start(async () => {
              setMsg(null);
              const r = await action(text);
              if (r && !r.ok) return setMsg({ tone: "error", text: r.error });
              if (redirectTo) return router.push(redirectTo);
              const count = r && "data" in r ? (r.data as { count?: number } | undefined)?.count : undefined;
              setMsg({ tone: "success", text: done ? done.replace("{count}", String(count ?? "")) : "Done." });
              setOpen(false);
              setText("");
              router.refresh();
            });
          }}
        >
          {removes && removes.length > 0 && (
            <div className="text-sm">
              <p className="font-medium">This permanently removes:</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {removes.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <label htmlFor={`confirm-${id}`} className="block text-sm">
            {phraseHint ?? "To confirm, type"} <strong className="select-all font-mono">{phrase}</strong>
          </label>
          <Input id={`confirm-${id}`} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" disabled={!matches || pending}>
              {pending ? "Working…" : button}
            </Button>
            <Button type="button" variant="ghost" onClick={() => (setOpen(false), setText(""))}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}
