"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { remindParticipantsAction } from "@/app/(app)/orgs/[orgId]/rounds/[campaignId]/actions";

export type RoundPerson = { memberId: string; name: string; started: boolean; reminders: number; lastRemindedAt: string | null; canRemind: boolean; reason: string | null };

/** Remind round participants to set up their own 360. Admins never see or contact raters. */
export function RoundReminders({ orgId, campaignId, people }: { orgId: string; campaignId: string; people: RoundPerson[] }) {
  const [picked, setPicked] = useState(() => new Set(people.filter((p) => p.canRemind).map((p) => p.memberId)));
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const chosen = people.filter((p) => p.canRemind && picked.has(p.memberId));
  return (
    <div className="space-y-3" data-testid="round-reminders">
      <ul className="divide-y rounded-md border text-sm">
        {people.map((p) => (
          <li key={p.memberId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="round-person">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                disabled={!p.canRemind}
                checked={p.canRemind && picked.has(p.memberId)}
                onChange={() => {
                  const n = new Set(picked);
                  if (n.has(p.memberId)) n.delete(p.memberId);
                  else n.add(p.memberId);
                  setPicked(n);
                }}
              />
              <span className="font-medium">{p.name}</span>
            </label>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {p.started ? <Badge variant="success">Set up</Badge> : <Badge variant="outline">Not started</Badge>}
              {p.reminders > 0 && `${p.reminders} reminder${p.reminders > 1 ? "s" : ""}`}
              {!p.canRemind && !p.started && p.reason}
            </span>
          </li>
        ))}
      </ul>
      <Button
        disabled={busy || chosen.length === 0}
        data-testid="remind-participants"
        onClick={() =>
          start(async () => {
            const r = await remindParticipantsAction(orgId, campaignId, chosen.map((c) => c.memberId));
            setMsg(r.ok ? { tone: "success", text: `Reminded ${r.data!.sent}${r.data!.skipped.length ? `; skipped ${r.data!.skipped.length}` : ""}.` } : { tone: "error", text: r.error });
            router.refresh();
          })
        }
      >
        {busy ? "Sending…" : chosen.length ? `Remind ${chosen.length} ${chosen.length === 1 ? "person" : "people"}` : "Everyone is set up or recently reminded"}
      </Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}
