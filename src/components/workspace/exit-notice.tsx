"use client";

import { useTransition, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { copyExitReportsAction } from "@/app/(app)/workspace/actions";

export type PendingExit = { memberId: string; orgName: string; deleteAt: string; copyAllowed: boolean; copied: boolean; reports: number };

/** Shown in Personal after leaving a company, until its data is deleted. */
export function ExitNotice({ exit }: { exit: PendingExit }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const date = new Date(exit.deleteAt).toLocaleDateString();
  if (exit.copied) {
    return (
      <Alert tone="success" data-testid="exit-notice">
        Your {exit.orgName} reports are copied to Personal. Your other {exit.orgName} data is deleted on {date}.
      </Alert>
    );
  }
  if (!exit.copyAllowed || exit.reports === 0) {
    return (
      <Alert tone="info" data-testid="exit-notice">
        You left {exit.orgName}. Your 360s there are deleted on {date}
        {exit.reports > 0 ? `; ${exit.orgName} doesn't allow copying them.` : "."}
      </Alert>
    );
  }
  return (
    <Alert tone="info" className="flex flex-wrap items-center justify-between gap-2" data-testid="exit-notice">
      <span>
        You left {exit.orgName}. Copy your {exit.reports} report{exit.reports === 1 ? "" : "s"} to Personal before {date}. Copies keep scores, themes and AI
        summaries, not raters&apos; written comments.
        {error && <span className="block text-destructive">{error}</span>}
      </span>
      <Button
        size="sm"
        disabled={pending}
        data-testid="copy-exit-reports"
        onClick={() =>
          start(async () => {
            const r = await copyExitReportsAction(exit.memberId);
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? "Copying…" : "Copy my reports"}
      </Button>
    </Alert>
  );
}
