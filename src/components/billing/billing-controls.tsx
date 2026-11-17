"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents } from "@/lib/billing/catalog";
import { creditsLabel, formatCredits, topUpPrice, type Policy } from "@/lib/billing/pricing";
import { buyAction, cancelSubscriptionAction, giftFull360Action, stubPayAction } from "@/app/(app)/billing/actions";

type FeeRates = Pick<Policy, "cardFeeBps" | "cardFeeFixedCents" | "otherFeeBps" | "otherFeeFixedCents">;

export function BuyButton({ product, label, context, variant = "default" }: { product: string; label: string; context?: { orgId?: string }; variant?: "default" | "outline" }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        disabled={pending}
        data-testid={`buy-${product}`}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await buyAction(product, context);
            if (!r.ok) return setError(r.error);
            window.location.assign(r.data!.url);
          })
        }
      >
        {pending ? "Opening checkout…" : label}
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

export function StubCheckout({ paymentId }: { paymentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (pay: boolean) =>
    start(async () => {
      setError(null);
      const r = await stubPayAction(paymentId, pay);
      if (!r.ok) return setError(r.error);
      router.push(pay ? `/billing?paid=${paymentId}` : `/billing?canceled=${paymentId}`);
    });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => go(true)} disabled={pending}>
          {pending ? "Processing…" : "Pay (test)"}
        </Button>
        <Button variant="outline" onClick={() => go(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

export function CancelSubscriptionButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (!confirm("Stop renewal? You keep access until the end of the current period.")) return;
            const r = await cancelSubscriptionAction(id);
            if (!r.ok) return setError(r.error);
            router.refresh();
          })
        }
      >
        Cancel renewal
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </>
  );
}

export function GiftFull360Button({ clientId, price, balance }: { clientId: string; price: number; balance: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const router = useRouter();
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        data-testid="gift-full-360"
        onClick={() =>
          start(async () => {
            const r = await giftFull360Action(clientId);
            setMsg(r.ok ? { tone: "success", text: "Gifted. Their next 360 is paid for." } : { tone: "error", text: r.error });
            router.refresh();
          })
        }
      >
        Gift a 360 ({creditsLabel(price)})
      </Button>
      <p className="text-xs text-muted-foreground">You have {formatCredits(balance)} credits.</p>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}

/** Buy any whole number of credits; the buyer pays the card and processing fees shown. */
export function BuyCredits({ fees, min, max, orgId, suggested = [25, 50, 100, 250] }: { fees: FeeRates; min: number; max: number; orgId?: string; suggested?: number[] }) {
  const [value, setValue] = useState(String(suggested[1] ?? min));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  const valid = Number.isInteger(n) && n >= min && n <= max;
  const price = valid ? topUpPrice(n, fees) : null;
  const id = orgId ? "company-credits" : "credits";
  return (
    <div className="space-y-3" data-testid={orgId ? "buy-company-credits" : "buy-credits"}>
      <div className="flex flex-wrap gap-2">
        {suggested
          .filter((s) => s >= min && s <= max)
          .map((s) => (
            <Button key={s} type="button" size="sm" variant={n === s ? "default" : "outline"} onClick={() => setValue(String(s))}>
              {s}
            </Button>
          ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={id}>Credits to buy</Label>
          <Input id={id} inputMode="numeric" className="w-40" value={value} onChange={(e) => setValue(e.target.value)} aria-describedby={`${id}-price`} />
        </div>
        <Button
          disabled={!valid || pending}
          data-testid="buy-credits-button"
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await buyAction("credits", { credits: n, orgId });
              if (!r.ok) return setError(r.error);
              window.location.assign(r.data!.url);
            })
          }
        >
          {pending ? "Opening checkout…" : price ? `Pay ${formatCents(price.totalCents)}` : "Buy credits"}
        </Button>
      </div>
      <p id={`${id}-price`} className="text-sm text-muted-foreground" data-testid="credit-price">
        {price
          ? `${n.toLocaleString("en-US")} credits ${formatCents(price.creditsCents)} + card and processing fees ${formatCents(price.feeCents)} = ${formatCents(price.totalCents)}`
          : `Enter a whole number from ${min} to ${max.toLocaleString("en-US")}.`}
      </p>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
