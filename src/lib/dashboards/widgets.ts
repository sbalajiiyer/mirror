/**
 * Dashboard widget catalog (Phase 8). Isomorphic: the builder UI, the natural-language matcher and the
 * server all use this list. Every widget is computed by an existing privacy-safe service, so a
 * dashboard can never show more than its owner can already see.
 */

export type Scope = "PERSONAL" | "COACH" | "ORG";
export type WidgetType =
  | "latest_scores"
  | "trend"
  | "goals"
  | "benchmarks"
  | "sessions"
  | "clients"
  | "client_patterns"
  | "org_participation"
  | "org_strengths"
  | "team_profile"
  | "cohort_compare";

export type WidgetConfig = { surveyId?: string; groupId?: string; aGroupId?: string; aRoundId?: string; bGroupId?: string; bRoundId?: string };
export type Widget = { id: string; type: WidgetType; config: WidgetConfig };
export type Cell = string | number | null;
export type WidgetData = { title: string; note?: string; columns: string[]; rows: Cell[][]; bar?: number; max?: number; locked?: string };

export const WIDGETS: { type: WidgetType; scope: Scope; label: string; description: string; keywords: string[]; needs?: ("survey" | "group" | "compare")[] }[] = [
  { type: "latest_scores", scope: "PERSONAL", label: "Latest scores", description: "Others' and your own average per competency from your latest report", keywords: ["score", "latest", "competenc", "self", "gap", "rating"] },
  { type: "trend", scope: "PERSONAL", label: "Trend across sessions", description: "Each competency across every session of one survey", keywords: ["trend", "over time", "progress", "change", "improv", "session"], needs: ["survey"] },
  { type: "goals", scope: "PERSONAL", label: "Goal progress", description: "How close you are to each goal", keywords: ["goal", "target"] },
  { type: "benchmarks", scope: "PERSONAL", label: "Benchmarks", description: "Your latest scores against anonymous norms", keywords: ["benchmark", "compare to others", "percentile", "norm", "others like me", "rank"] },
  { type: "sessions", scope: "PERSONAL", label: "All sessions", description: "Every session with its status, responses and score", keywords: ["sessions", "status", "responses", "response rate", "all my", "list"] },
  { type: "clients", scope: "COACH", label: "Clients", description: "Each client's latest session, score and next coaching session", keywords: ["client", "portfolio", "who"] },
  { type: "client_patterns", scope: "COACH", label: "Patterns across clients", description: "Competency averages and blind spots across clients (5+)", keywords: ["pattern", "across", "blind spot", "distribution", "common"] },
  { type: "org_participation", scope: "ORG", label: "Participation", description: "Funnel and rater response rate for each 360 round", keywords: ["participation", "response rate", "taking part", "funnel", "round", "completion"] },
  { type: "org_strengths", scope: "ORG", label: "Org strengths and gaps", description: "Org-wide competency averages (5+ people)", keywords: ["strength", "gap", "org", "weak", "organization"] },
  { type: "team_profile", scope: "ORG", label: "Team profile", description: "A team's competency averages vs the org, with spread", keywords: ["team", "radar", "spread", "dynamics"], needs: ["group"] },
  { type: "cohort_compare", scope: "ORG", label: "Cohort comparison", description: "Two cohorts, or before vs after (two rounds)", keywords: ["cohort", "before", "after", "versus", " vs "], needs: ["compare"] },
];

export const widgetsFor = (scope: Scope) => WIDGETS.filter((w) => w.scope === scope);
export const widgetLabel = (t: WidgetType) => WIDGETS.find((w) => w.type === t)?.label ?? t;

/** Offline fallback for natural-language questions: best keyword match among the scope's widgets. */
export function matchWidget(question: string, scope: Scope): WidgetType | null {
  const q = ` ${question.toLowerCase()} `;
  let best: { type: WidgetType; score: number } | null = null;
  for (const w of widgetsFor(scope)) {
    const score = w.keywords.reduce((s, k) => s + (q.includes(k) ? k.length : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { type: w.type, score };
  }
  return best?.type ?? null;
}

/** RFC 4180 CSV. */
export function toCsv(d: Pick<WidgetData, "columns" | "rows">) {
  const esc = (c: Cell) => {
    if (typeof c === "number") return String(c);
    const s = c == null ? "" : c;
    return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
  };
  return [d.columns, ...d.rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

/** Plain-text table for emails (first `max` rows). */
export function toText(d: WidgetData, max = 10) {
  if (d.locked) return `${d.title}\n  ${d.locked}`;
  const rows = d.rows.slice(0, max).map((r) => "  " + r.map((c) => (c == null ? "–" : typeof c === "number" ? (Number.isInteger(c) ? String(c) : c.toFixed(2)) : c)).join(" · "));
  return [d.title, "  " + d.columns.join(" · "), ...rows, d.rows.length > max ? `  … ${d.rows.length - max} more` : ""].filter(Boolean).join("\n");
}
