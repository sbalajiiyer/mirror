"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createShareAction, revokeShareAction } from "@/app/(app)/assessments/[id]/share/actions";

const KINDS = [
  { value: "BADGE", label: "Verified strengths badge", help: "Your top strengths, how many raters backed them, and a public verify page you can add to LinkedIn." },
  { value: "SUMMARY", label: "One-page summary", help: "Only the sections you pick, on one page that can be printed or saved as PDF." },
  { value: "REPORT", label: "Full report (read-only)", help: "For a mentor or manager: every chart and score, but never raters' comments." },
] as const;
const SECTIONS = [
  ["strengths", "Strengths"],
  ["growth", "Growth areas"],
  ["chart", "Competency chart"],
  ["narrative", "Summary paragraph"],
] as const;

export function CreateShareForm({ assessmentId }: { assessmentId: string }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("BADGE");
  const [sections, setSections] = useState<string[]>(["strengths", "chart"]);
  const [note, setNote] = useState("");
  const [expires, setExpires] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      data-testid="create-share"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await createShareAction(assessmentId, { kind, sections, note, expiresInDays: expires ? Number(expires) : null });
          if (!r.ok) return setError(r.error);
          router.refresh();
        });
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What to share</legend>
        {KINDS.map((k) => (
          <label key={k.value} className="flex items-start gap-2 text-sm">
            <input type="radio" name="kind" className="mt-1 size-4" checked={kind === k.value} onChange={() => setKind(k.value)} />
            <span>
              <span className="font-medium">{k.label}</span>
              <span className="block text-xs text-muted-foreground">{k.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {kind === "SUMMARY" && (
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-1 text-sm font-medium">Sections</legend>
          {SECTIONS.map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={sections.includes(v)} onChange={(e) => setSections((s) => (e.target.checked ? [...s, v] : s.filter((x) => x !== v)))} />
              {l}
            </label>
          ))}
        </fieldset>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          Note on the page (optional)
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="e.g. Shared with my mentor" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Link expires
          <select value={expires} onChange={(e) => setExpires(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Never (until I revoke it)</option>
            <option value="7">In 7 days</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
          </select>
        </label>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create link"}
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          prompt("Copy this link", text);
        }
      }}
    >
      <Copy /> {copied ? "Copied" : label}
    </Button>
  );
}

export function RevokeButton({ assessmentId, id }: { assessmentId: string; id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        confirm("Revoke this link? Anyone who has it will see “no longer available”.") &&
        start(async () => {
          await revokeShareAction(assessmentId, id);
          router.refresh();
        })
      }
    >
      Revoke
    </Button>
  );
}
