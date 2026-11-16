"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buyAction, cancelSubscriptionAction, giftFull360Action, stubPayAction } from "@/app/(app)/billing/actions";

export function BuyButton({ product, label, context, variant = "default" }: { product: string; label: string; context?: { assessmentId?: string; orgId?: string }; variant?: "default" | "outline" }) {
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

export function GiftFull360Button({ clientId, credits }: { clientId: string; credits: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const router = useRouter();
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending || credits < 1}
        data-testid="gift-full-360"
        onClick={() =>
          start(async () => {
            const r = await giftFull360Action(clientId);
            setMsg(r.ok ? { tone: "success", text: "Gifted. Their next 360 can have unlimited raters and a PDF." } : { tone: "error", text: r.error });
            router.refresh();
          })
        }
      >
        Gift a full 360 ({credits} credit{credits === 1 ? "" : "s"} left)
      </Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}
