"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameSessionAction } from "@/app/(app)/assessments/progress-actions";

/** "Survey MRR-XXXX · Session 2 · Pulse check · <label>" with inline rename. */
export function SessionHeader({
  assessmentId,
  code,
  sessionNumber,
  kind,
  label,
  editable = true,
}: {
  assessmentId: string;
  code: string;
  sessionNumber: number;
  kind: string;
  label: string | null;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-testid="session-header">
      <Badge variant="outline" className="font-mono" title="Survey ID">
        {code}
      </Badge>
      <span>
        Session {sessionNumber} · {kind}
      </span>
      {editing ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              await renameSessionAction(assessmentId, value);
              setEditing(false);
              router.refresh();
            });
          }}
        >
          <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} className="h-7 w-48 text-xs" aria-label="Session name" autoFocus />
          <Button size="sm" type="submit" disabled={pending} className="h-7">
            Save
          </Button>
        </form>
      ) : (
        <>
          {label && <span>· {label}</span>}
          {editable && (
            <button type="button" onClick={() => setEditing(true)} className="no-print inline-flex items-center gap-1 text-xs hover:text-foreground" aria-label="Rename session">
              <Pencil className="size-3" /> {label ? "Rename" : "Name this session"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
