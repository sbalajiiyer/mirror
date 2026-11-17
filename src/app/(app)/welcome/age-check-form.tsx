"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MONTHS, birthYears } from "@/lib/age";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/components/ui/field-classes";
import { confirmAgeAction } from "./actions";

export function AgeCheckForm({ next }: { next: string }) {
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (blocked) return <AgeBlocked signOutNow />;
  return (
    <form
      className="mt-6 space-y-5"
      data-testid="age-check"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await confirmAgeAction({ month: Number(month), year: Number(year), terms });
          if (!r.ok) return setError(r.error);
          if (r.data!.blocked) return setBlocked(true);
          router.push(next);
          router.refresh();
        });
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">When were you born?</legend>
        <div className="flex gap-3">
          <div className="space-y-1">
            <Label htmlFor="birth-month" className="sr-only">
              Month
            </Label>
            <select id="birth-month" className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)} required>
              <option value="">Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="birth-year" className="sr-only">
              Year
            </Label>
            <select id="birth-year" className={selectClass} value={year} onChange={(e) => setYear(e.target.value)} required>
              <option value="">Year</option>
              {birthYears().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">We only use this to check you can use Mirror. We don&apos;t save it.</p>
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4" checked={terms} onChange={(e) => setTerms(e.target.checked)} data-testid="accept-terms" />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="underline" target="_blank">
            terms of service
          </Link>{" "}
          and have read the{" "}
          <Link href="/privacy" className="underline" target="_blank">
            privacy policy
          </Link>
          .
        </span>
      </label>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" disabled={pending || !month || !year || !terms} data-testid="age-continue">
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}

export function AgeBlocked({ signOutNow = false }: { signOutNow?: boolean }) {
  return (
    <div className="mx-auto max-w-md space-y-4" data-testid="age-blocked">
      <h1 className="text-2xl font-semibold tracking-tight">Sorry, you can&apos;t use Mirror</h1>
      <p className="text-muted-foreground">Mirror is only for people above a minimum age. We&apos;ve deleted the account and the email address you used.</p>
      {signOutNow && (
        <Button asChild variant="outline">
          <Link href="/">Close</Link>
        </Button>
      )}
    </div>
  );
}
