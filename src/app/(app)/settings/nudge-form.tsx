"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { setNudgeDayAction } from "./nudge-actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function NudgeForm({ initial }: { initial: number | null }) {
  const [day, setDay] = useState<string>(initial == null ? "" : String(initial));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      data-testid="nudge-form"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        start(async () => {
          const r = await setNudgeDayAction(day === "" ? null : Number(day));
          if (!r.ok) return setError(r.error);
          setSaved(true);
        });
      }}
    >
      <label className="grid gap-1 text-sm font-medium">
        Weekly nudge email
        <select value={day} onChange={(e) => setDay(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Off</option>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              Every {d}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        Save
      </Button>
      {saved && (
        <span className="text-sm text-muted-foreground" role="status">
          Saved.
        </span>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}
