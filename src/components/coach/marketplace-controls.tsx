"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestIntroAction, updateListingAction } from "@/app/(app)/coaches/actions";

export function RequestIntroButton({ coachId }: { coachId: string }) {
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (state?.ok)
    return (
      <Alert tone="success" data-testid="intro-sent">
        Request sent. The coach gets an email; once they accept, you choose what they can see on your{" "}
        <Link href="/coaching" className="underline">
          Coaching
        </Link>{" "}
        page.
      </Alert>
    );
  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        data-testid="request-intro"
        onClick={() =>
          start(async () => {
            const r = await requestIntroAction(coachId);
            setState(r.ok ? { ok: true, text: "" } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? "Sending…" : "Request an intro"}
      </Button>
      <p className="text-xs text-muted-foreground">Nothing is shared until the coach accepts and you choose what to share.</p>
      {state && !state.ok && <Alert tone="error">{state.text}</Alert>}
    </div>
  );
}

type Listing = { listed: boolean; headline: string; bio: string; specialties: string; languages: string; price: string };

export function ListingForm({ initial, canList, verified }: { initial: Listing; canList: boolean; verified: boolean }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  return (
    <form
      className="space-y-4"
      data-testid="listing-form"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await updateListingAction({
            listed: s.listed,
            headline: s.headline,
            bio: s.bio,
            specialties: list(s.specialties),
            languages: list(s.languages),
            sessionPriceCents: s.price.trim() ? Math.round(Number(s.price) * 100) : null,
          });
          if (!r.ok) return setMsg({ tone: "error", text: r.error });
          setMsg({ tone: "success", text: s.listed ? (verified ? "Saved. You're listed in the marketplace." : "Saved. You'll appear once your profile is verified.") : "Saved." });
          router.refresh();
        });
      }}
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={s.listed} onChange={(e) => setS({ ...s, listed: e.target.checked })} disabled={!canList && !s.listed} />
        List me in the coach marketplace
      </label>
      {!canList && <p className="text-xs text-muted-foreground">Listing needs a Coach Starter or Coach Pro plan.</p>}
      <div className="space-y-1.5">
        <Label htmlFor="ls-headline">Headline</Label>
        <Input id="ls-headline" value={s.headline} onChange={(e) => setS({ ...s, headline: e.target.value })} maxLength={120} placeholder="e.g. Leadership coach for first-time managers" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ls-bio">Short bio</Label>
        <Textarea id="ls-bio" value={s.bio} onChange={(e) => setS({ ...s, bio: e.target.value })} maxLength={1500} rows={4} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ls-spec">Specialties (comma-separated)</Label>
          <Input id="ls-spec" value={s.specialties} onChange={(e) => setS({ ...s, specialties: e.target.value })} placeholder="Leadership, Communication" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ls-lang">Languages</Label>
          <Input id="ls-lang" value={s.languages} onChange={(e) => setS({ ...s, languages: e.target.value })} placeholder="English" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ls-price">Price per session (USD)</Label>
          <Input id="ls-price" type="number" min={0} step={1} value={s.price} onChange={(e) => setS({ ...s, price: e.target.value })} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">When a client you meet through the marketplace accepts coaching, a referral fee of 10% of one session (minimum $15) is due.</p>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save listing"}
      </Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </form>
  );
}
