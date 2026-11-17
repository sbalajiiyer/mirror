"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSessionDetailsAction } from "@/app/(app)/assessments/progress-actions";

/** "Survey MRR-XXXX · Session 2 · Pulse check · <label>", company and tags, with inline editing. */
export function SessionHeader({
  assessmentId,
  code,
  sessionNumber,
  kind,
  label,
  company = null,
  tags = [],
  editable = true,
}: {
  assessmentId: string;
  code: string;
  sessionNumber: number;
  kind: string;
  label: string | null;
  company?: string | null;
  tags?: string[];
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label ?? "");
  const [comp, setComp] = useState(company ?? "");
  const [tagText, setTagText] = useState(tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2 text-sm text-muted-foreground" data-testid="session-header">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono" title="Survey ID">
          {code}
        </Badge>
        <span>
          Session {sessionNumber} · {kind}
        </span>
        {label && <span>· {label}</span>}
        {company && (
          <span className="inline-flex items-center gap-1" title="Company">
            · <Building2 className="size-3.5" aria-hidden /> {company}
          </span>
        )}
        {tags.map((t) => (
          <Badge key={t} variant="secondary" className="font-normal">
            #{t}
          </Badge>
        ))}
        {editable && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="no-print inline-flex items-center gap-1 text-xs hover:text-foreground" aria-label="Edit session details">
            <Pencil className="size-3" aria-hidden /> {label ? "Edit" : "Name this session"}
          </button>
        )}
      </div>
      {editing && (
        <form
          className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end"
          data-testid="session-details-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await updateSessionDetailsAction(assessmentId, { label: name, company: comp, tags: tagText });
              if (!res.ok) return setError(res.error);
              setEditing(false);
              router.refresh();
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`sn-${assessmentId}`} className="text-xs">
              Session name
            </Label>
            <Input id={`sn-${assessmentId}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-8 text-xs" autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`co-${assessmentId}`} className="text-xs">
              Company
            </Label>
            <Input id={`co-${assessmentId}`} value={comp} onChange={(e) => setComp(e.target.value)} maxLength={80} className="h-8 text-xs" placeholder="e.g. Acme Corp" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`tg-${assessmentId}`} className="text-xs">
              Tags (comma-separated)
            </Label>
            <Input id={`tg-${assessmentId}`} value={tagText} onChange={(e) => setTagText(e.target.value)} maxLength={300} className="h-8 text-xs" placeholder="e.g. promotion, new team" />
          </div>
          <div className="flex gap-1">
            <Button size="sm" type="submit" disabled={pending}>
              Save
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive sm:col-span-4">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
