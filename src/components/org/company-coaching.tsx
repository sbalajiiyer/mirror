"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/components/ui/field-classes";
import { endCompanyCoachingAction, offerCoachingAction } from "@/app/(app)/orgs/[orgId]/coaching/actions";

export function OfferCoachingForm({ orgId, members }: { orgId: string; members: { id: string; name: string }[] }) {
  const [member, setMember] = useState(members[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  if (members.length === 0) return <p className="text-sm text-muted-foreground">Invite people first.</p>;
  return (
    <form
      className="space-y-3"
      data-testid="offer-coaching"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await offerCoachingAction(orgId, member, email);
          setMsg(r.ok ? { tone: "success", text: "Offered. They'll get an email and can accept or decline." } : { tone: "error", text: r.error });
          if (r.ok) setEmail("");
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="coach-member">Person</Label>
          <select id="coach-member" className={selectClass} value={member} onChange={(e) => setMember(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="coach-email">Coach&apos;s email</Label>
          <Input id="coach-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Offering…" : "Offer coaching"}
      </Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </form>
  );
}

export function EndCoachingButton({ orgId, linkId }: { orgId: string; linkId: string }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() =>
        confirm("Stop paying for this coaching? It ends for both the person and the coach.") &&
        start(async () => {
          await endCompanyCoachingAction(orgId, linkId);
          router.refresh();
        })
      }
    >
      End
    </Button>
  );
}
