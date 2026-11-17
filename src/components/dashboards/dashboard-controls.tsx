"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Sparkles, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { WIDGETS, type Scope, type Widget, type WidgetData } from "@/lib/dashboards/widgets";
import { addWidgetAction, askDashboardAction, createDashboardAction, deleteDashboardAction, moveWidgetAction, removeWidgetAction, setScheduleAction } from "@/app/(app)/dashboards/actions";

const sel = "h-10 rounded-md border border-input bg-background px-3 text-sm";
const fmt = (c: string | number | null) => (c == null ? "–" : typeof c === "number" ? (Number.isInteger(c) ? String(c) : c.toFixed(2)) : c);

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = <T,>(fn: () => Promise<ActionResult<T>>, after?: (d: T | undefined) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      after?.(r.data);
      router.refresh();
    });
  return { pending, error, run, router };
}

export function CreateDashboardForm({ scopes }: { scopes: { value: string; label: string; scope: Scope; orgId?: string }[] }) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState(scopes[0].value);
  const { pending, error, run, router } = useRun();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      data-testid="create-dashboard"
      onSubmit={(e) => {
        e.preventDefault();
        const s = scopes.find((x) => x.value === scope)!;
        run(() => createDashboardAction({ name, scope: s.scope, orgId: s.orgId ?? null }), (d) => d && router.push(`/dashboards/${d.id}`));
      }}
    >
      <label className="grid gap-1 text-xs font-medium">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} className="h-9 w-56" placeholder="e.g. My growth" />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Data
        <select value={scope} onChange={(e) => setScope(e.target.value)} className={sel}>
          {scopes.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        Create dashboard
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}

type Opts = { surveys: { id: string; title: string }[]; groups: { id: string; name: string; kind: string }[]; rounds: { id: string; name: string }[] };

export function AddWidgetForm({ dashboardId, scope, opts }: { dashboardId: string; scope: Scope; opts: Opts }) {
  const types = WIDGETS.filter((w) => w.scope === scope);
  const [type, setType] = useState(types[0].type);
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const { pending, error, run } = useRun();
  const needs = types.find((t) => t.type === type)?.needs ?? [];
  const pick = (k: string, label: string, list: { id: string; name: string }[], anyLabel?: string) => (
    <label className="grid gap-1 text-xs font-medium">
      {label}
      <select value={cfg[k] ?? ""} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} className={sel}>
        {anyLabel && <option value="">{anyLabel}</option>}
        {list.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      data-testid="add-widget"
      onSubmit={(e) => {
        e.preventDefault();
        const config = Object.fromEntries(Object.entries(cfg).filter(([, v]) => v));
        run(() => addWidgetAction(dashboardId, { type, config }), () => setCfg({}));
      }}
    >
      <label className="grid gap-1 text-xs font-medium">
        Widget
        <select value={type} onChange={(e) => setType(e.target.value as Widget["type"])} className={sel}>
          {types.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {needs.includes("survey") && pick("surveyId", "Survey", opts.surveys.map((s) => ({ id: s.id, name: s.title })), "Latest")}
      {needs.includes("group") && pick("groupId", "Team or cohort", opts.groups)}
      {needs.includes("compare") && (
        <>
          {pick("aGroupId", "A: group", opts.groups, "Everyone")}
          {pick("aRoundId", "A: round", opts.rounds, "Latest")}
          {pick("bGroupId", "B: group", opts.groups, "Everyone")}
          {pick("bRoundId", "B: round", opts.rounds, "Latest")}
        </>
      )}
      <Button type="submit" disabled={pending}>
        Add widget
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}

export function WidgetActions({ dashboardId, widgetId, first, last }: { dashboardId: string; widgetId: string; first: boolean; last: boolean }) {
  const { pending, run } = useRun();
  return (
    <span className="no-print flex items-center">
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Move widget up" disabled={pending || first} onClick={() => run(() => moveWidgetAction(dashboardId, widgetId, -1))}>
        <ArrowUp className="size-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Move widget down" disabled={pending || last} onClick={() => run(() => moveWidgetAction(dashboardId, widgetId, 1))}>
        <ArrowDown className="size-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove widget" disabled={pending} onClick={() => run(() => removeWidgetAction(dashboardId, widgetId))}>
        <Trash2 className="size-3.5" />
      </Button>
    </span>
  );
}

export function AskBox({ dashboardId }: { dashboardId: string }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ widget: Widget; data: WidgetData | null; error?: string; explanation: string } | null>(null);
  const { pending, error, run } = useRun();
  const [adding, startAdd] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3" data-testid="ask-data">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setRes(null);
          run(() => askDashboardAction(dashboardId, q), (d) => d && setRes(d));
        }}
      >
        <label htmlFor="ask-q" className="sr-only">
          Ask a question about your data
        </label>
        <Input id="ask-q" value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder="e.g. How are my goals going? · Which team has the biggest spread?" className="min-w-0 flex-1" />
        <Button type="submit" disabled={pending || q.trim().length < 3}>
          <Sparkles /> {pending ? "Thinking…" : "Ask"}
        </Button>
      </form>
      {error && <Alert tone="error">{error}</Alert>}
      {res && (
        <div className="space-y-2 rounded-lg border p-3" data-testid="ask-result">
          <p className="text-sm text-muted-foreground">{res.explanation}</p>
          {res.data ? (
            <>
              <p className="font-medium">{res.data.title}</p>
              {res.data.locked ? (
                <p className="text-sm text-muted-foreground">{res.data.locked}</p>
              ) : (
                <table className="w-full text-sm">
                  <caption className="sr-only">{res.data.title}</caption>
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      {res.data.columns.map((c, i) => (
                        <th key={i} className="font-normal">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {res.data.rows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t">
                        {r.map((c, j) => (
                          <td key={j} className="py-1 tabular-nums">
                            {fmt(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={adding}
                onClick={() =>
                  startAdd(async () => {
                    await addWidgetAction(dashboardId, { type: res.widget.type, config: res.widget.config });
                    setRes(null);
                    setQ("");
                    router.refresh();
                  })
                }
              >
                Add to dashboard
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{res.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ScheduleForm({ dashboardId, schedule, day }: { dashboardId: string; schedule: string | null; day: number | null }) {
  const [s, setS] = useState(schedule ?? "");
  const [d, setD] = useState(day ?? (schedule === "monthly" ? 1 : 1));
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useRun();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      data-testid="schedule-form"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(() => setScheduleAction(dashboardId, { schedule: s || null, day: s ? d : null }), () => setSaved(true));
      }}
    >
      <label className="grid gap-1 text-xs font-medium">
        Email me this dashboard
        <select value={s} onChange={(e) => setS(e.target.value)} className={sel}>
          <option value="">Never</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
      {s === "weekly" && (
        <label className="grid gap-1 text-xs font-medium">
          On
          <select value={d} onChange={(e) => setD(Number(e.target.value))} className={sel}>
            {DAYS.map((x, i) => (
              <option key={x} value={i}>
                {x}
              </option>
            ))}
          </select>
        </label>
      )}
      {s === "monthly" && (
        <label className="grid gap-1 text-xs font-medium">
          Day of month
          <Input type="number" min={1} max={28} value={d} onChange={(e) => setD(Number(e.target.value))} className="h-9 w-20" />
        </label>
      )}
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

export function DeleteDashboardButton({ dashboardId }: { dashboardId: string }) {
  const { pending, run, router } = useRun();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => confirm("Delete this dashboard?") && run(() => deleteDashboardAction(dashboardId), () => router.push("/dashboards"))}>
      Delete dashboard
    </Button>
  );
}
