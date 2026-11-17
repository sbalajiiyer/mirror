"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDiscountAction,
  revokeDiscountAction,
  savePolicyAction,
} from "@/app/(app)/admin/pricing/actions";
import {
  DEFAULT_POLICY,
  DISCOUNT_SCOPES,
  SCOPE_LABEL,
  topUpPrice,
  type Policy,
} from "@/lib/billing/pricing";
import { formatCents } from "@/lib/billing/catalog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/components/ui/field-classes";

/**
 * How each stored value is shown: credits and dollars with 2 decimals (stored in hundredths),
 * percentages with up to 2 decimals (stored in basis points), the markup as a multiplier.
 */
type Unit = "credits" | "dollars" | "percent" | "times" | "count";
const FIELDS: { key: keyof Policy; label: string; unit: Unit; help: string }[] =
  [
    {
      key: "survey360",
      label: "360 survey",
      unit: "credits",
      help: "A new personal 360",
    },
    {
      key: "followUp",
      label: "Follow-up session",
      unit: "credits",
      help: "Running a survey again",
    },
    {
      key: "pulse",
      label: "Pulse check",
      unit: "credits",
      help: "Personal and company",
    },
    {
      key: "coachGift",
      label: "Coach gifts a 360",
      unit: "credits",
      help: "Paid by the coach",
    },
    {
      key: "companyParticipant",
      label: "Company round, per person",
      unit: "credits",
      help: "Also company follow-up sessions",
    },
    {
      key: "companyWelcomeCredits",
      label: "New company welcome credits",
      unit: "credits",
      help: "Given once when a company is created",
    },
    {
      key: "freeSurveys",
      label: "Free 360s per person",
      unit: "count",
      help: "Everything except premium AI",
    },
    {
      key: "premiumMarkupPct",
      label: "Premium AI price",
      unit: "times",
      help: "Multiple of the provider's cost (at least 1)",
    },
    {
      key: "cardFeeBps",
      label: "Card fee",
      unit: "percent",
      help: "Percentage added to top-ups",
    },
    {
      key: "cardFeeFixedCents",
      label: "Card fee, fixed",
      unit: "dollars",
      help: "Per top-up",
    },
    {
      key: "otherFeeBps",
      label: "Other costs",
      unit: "percent",
      help: "e.g. currency conversion or tax handling",
    },
    {
      key: "otherFeeFixedCents",
      label: "Other costs, fixed",
      unit: "dollars",
      help: "Per top-up",
    },
    {
      key: "minTopUp",
      label: "Smallest top-up",
      unit: "count",
      help: "Whole credits",
    },
    {
      key: "maxTopUp",
      label: "Largest top-up",
      unit: "count",
      help: "Whole credits",
    },
  ];

const SUFFIX: Record<Unit, string> = {
  credits: "credits",
  dollars: "$",
  percent: "%",
  times: "×",
  count: "",
};
const toText = (unit: Unit, v: number) =>
  unit === "count" ? String(v) : String(v / 100);
function fromText(unit: Unit, t: string): number | null {
  const s = t.trim();
  if (unit === "count") return /^\d+$/.test(s) ? Number(s) : null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function PolicyForm({ initial }: { initial: Policy }) {
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS.map((f) => [f.key, toText(f.unit, initial[f.key])]),
    ),
  );
  const [msg, setMsg] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const parsed = Object.fromEntries(
    FIELDS.map((f) => [f.key, fromText(f.unit, text[f.key] ?? "")]),
  ) as Record<keyof Policy, number | null>;
  const bad = FIELDS.filter((f) => parsed[f.key] == null).map((f) => f.label);
  const sample = bad.length ? null : topUpPrice(50, parsed as Policy);
  return (
    <form
      className="space-y-4"
      data-testid="policy-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (bad.length)
          return setMsg({ tone: "error", text: `Check: ${bad.join(", ")}` });
        start(async () => {
          const r = await savePolicyAction(parsed);
          setMsg(
            r.ok
              ? {
                  tone: "success",
                  text: r.data!.changed
                    ? `Saved ${r.data!.changed} change${r.data!.changed === 1 ? "" : "s"}.`
                    : "No changes.",
                }
              : { tone: "error", text: r.error },
          );
          if (r.ok) router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={`p-${f.key}`}>
              {f.label}
              {SUFFIX[f.unit] && (
                <span className="text-muted-foreground">
                  {" "}
                  ({SUFFIX[f.unit]})
                </span>
              )}
            </Label>
            <Input
              id={`p-${f.key}`}
              inputMode="decimal"
              value={text[f.key]}
              aria-invalid={parsed[f.key] == null}
              aria-describedby={`h-${f.key}`}
              onChange={(e) => setText({ ...text, [f.key]: e.target.value })}
            />
            <p id={`h-${f.key}`} className="text-xs text-muted-foreground">
              {f.help}
              {DEFAULT_POLICY[f.key] !== parsed[f.key] &&
                ` · starting value ${toText(f.unit, DEFAULT_POLICY[f.key])}`}
            </p>
          </div>
        ))}
      </div>
      {sample && (
        <p
          className="text-sm text-muted-foreground"
          data-testid="policy-sample"
        >
          Example: 50 credits cost the buyer {formatCents(sample.totalCents)} (
          {formatCents(sample.feeCents)} fees).
        </p>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button type="submit" disabled={pending} data-testid="save-policy">
        {pending ? "Saving…" : "Save pricing"}
      </Button>
    </form>
  );
}

export function DiscountForm({
  orgs,
}: {
  orgs: { id: string; name: string }[];
}) {
  const [s, setS] = useState({
    target: "org" as "org" | "user",
    who: "",
    percent: "10",
    scope: "ALL",
    note: "",
    startsAt: "",
    endsAt: "",
  });
  const [msg, setMsg] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      data-testid="discount-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createDiscountAction({
            ...s,
            percent: Number(s.percent),
            note: s.note || undefined,
            startsAt: s.startsAt || undefined,
            endsAt: s.endsAt || undefined,
          });
          setMsg(
            r.ok
              ? { tone: "success", text: "Discount added." }
              : { tone: "error", text: r.error },
          );
          if (r.ok) {
            setS({ ...s, who: "", note: "" });
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="d-target">For</Label>
          <select
            id="d-target"
            className={`${selectClass} w-full`}
            value={s.target}
            onChange={(e) =>
              setS({ ...s, target: e.target.value as "org" | "user", who: "" })
            }
          >
            <option value="org">A company</option>
            <option value="user">A person</option>
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="d-who">
            {s.target === "org" ? "Company" : "Person's email"}
          </Label>
          {s.target === "org" ? (
            <select
              id="d-who"
              className={`${selectClass} w-full`}
              value={s.who}
              onChange={(e) => setS({ ...s, who: e.target.value })}
            >
              <option value="">Choose a company</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id="d-who"
              type="email"
              value={s.who}
              onChange={(e) => setS({ ...s, who: e.target.value })}
              placeholder="name@example.com"
            />
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="d-percent">Percent off</Label>
          <Input
            id="d-percent"
            inputMode="numeric"
            value={s.percent}
            onChange={(e) => setS({ ...s, percent: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="d-scope">Applies to</Label>
          <select
            id="d-scope"
            className={`${selectClass} w-full`}
            value={s.scope}
            onChange={(e) => setS({ ...s, scope: e.target.value })}
          >
            {DISCOUNT_SCOPES.map((k) => (
              <option key={k} value={k}>
                {SCOPE_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="d-note">Note (optional)</Label>
          <Input
            id="d-note"
            value={s.note}
            onChange={(e) => setS({ ...s, note: e.target.value })}
            placeholder="e.g. Nonprofit rate"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="d-start">Starts (optional)</Label>
          <Input
            id="d-start"
            type="date"
            value={s.startsAt}
            onChange={(e) => setS({ ...s, startsAt: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="d-end">Ends (optional)</Label>
          <Input
            id="d-end"
            type="date"
            value={s.endsAt}
            onChange={(e) => setS({ ...s, endsAt: e.target.value })}
          />
        </div>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button
        type="submit"
        disabled={pending || !s.who}
        data-testid="add-discount"
      >
        {pending ? "Adding…" : "Add discount"}
      </Button>
    </form>
  );
}

export function RevokeDiscount({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (!confirm(`Remove the discount for ${label}?`)) return;
          await revokeDiscountAction(id);
          router.refresh();
        })
      }
    >
      Remove<span className="sr-only"> discount for {label}</span>
    </Button>
  );
}
