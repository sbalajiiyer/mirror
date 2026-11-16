/**
 * Progress over time (Phase 4). Pure functions over already-anonymised report data, so
 * nothing here can expose more than the individual reports already do.
 */
import type { ReportData } from "@/lib/report/compute";

export type SeriesPoint = {
  assessmentId: string;
  title: string;
  type: "FULL_360" | "PULSE";
  date: string; // ISO, closedAt
  raters: number;
  competencies: Record<string, { name: string; others: number | null; self: number | null }>;
};

export function toSeriesPoint(a: { id: string; title: string; type: "FULL_360" | "PULSE"; closedAt: Date | string }, report: ReportData): SeriesPoint | null {
  if (!report.anonymity.available) return null;
  const competencies: SeriesPoint["competencies"] = {};
  for (const c of report.competencies) competencies[c.key] = { name: c.name, others: c.others.mean, self: c.self };
  return { assessmentId: a.id, title: a.title, type: a.type, date: new Date(a.closedAt).toISOString(), raters: report.anonymity.othersN, competencies };
}

/** One row per assessment (oldest first) with a column per competency — ready for line charts. */
export function trendRows(points: SeriesPoint[]) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const keys = new Map<string, string>();
  for (const p of sorted) for (const [k, v] of Object.entries(p.competencies)) keys.set(k, v.name);
  return {
    competencies: [...keys.entries()].map(([key, name]) => ({ key, name, measured: sorted.filter((p) => p.competencies[key]?.others != null).length })),
    rows: sorted.map((p) => ({
      assessmentId: p.assessmentId,
      label: p.title,
      date: p.date,
      type: p.type,
      ...Object.fromEntries(Object.entries(p.competencies).flatMap(([k, v]) => [[`${k}:others`, v.others], [`${k}:self`, v.self]])),
    })) as ({ assessmentId: string; label: string; date: string; type: string } & Record<string, number | null | string>)[],
  };
}

/** Before/after: competencies measured in both, with the change in others' average. */
export function compare(before: SeriesPoint, after: SeriesPoint) {
  return Object.keys(before.competencies)
    .filter((k) => after.competencies[k] && before.competencies[k].others != null && after.competencies[k].others != null)
    .map((k) => {
      const b = before.competencies[k].others!;
      const a = after.competencies[k].others!;
      return { key: k, name: after.competencies[k].name, before: b, after: a, delta: Math.round((a - b) * 100) / 100 };
    })
    .sort((x, y) => y.delta - x.delta);
}

/**
 * Consecutive check-ins kept on schedule, counting back from the most recent. A check-in is
 * "on time" if it closed within 1.5× the cadence of the previous one; the streak breaks if the
 * latest is older than 1.5× the cadence.
 */
export function streak(closedDates: (Date | string)[], cadenceMonths: number | null, now = new Date()) {
  const dates = closedDates.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  if (!dates.length) return { count: 0, onTrack: false };
  if (!cadenceMonths) return { count: dates.length, onTrack: true };
  const window = cadenceMonths * 30.44 * 1.5 * 86400000;
  if (now.getTime() - dates[dates.length - 1] > window) return { count: 0, onTrack: false };
  let count = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    if (dates[i] - dates[i - 1] <= window) count++;
    else break;
  }
  return { count, onTrack: true };
}

export function addMonths(d: Date, months: number) {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

export type GoalProgress = { latest: number | null; latestDate: string | null; pct: number; achieved: boolean; measurements: number };

/** Progress from baseline to target using the latest measurement after the goal was set. */
export function goalProgress(goal: { competencyKey: string; baseline: number | null; target: number; createdAt: Date | string }, points: SeriesPoint[]): GoalProgress {
  const after = points
    .filter((p) => p.date >= new Date(goal.createdAt).toISOString() && p.competencies[goal.competencyKey]?.others != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = after[after.length - 1];
  const latest = last ? last.competencies[goal.competencyKey].others : null;
  const base = goal.baseline ?? latest ?? goal.target;
  const span = goal.target - base;
  const pct = latest == null ? 0 : span <= 0 ? 100 : Math.max(0, Math.min(100, Math.round(((latest - base) / span) * 100)));
  return { latest, latestDate: last?.date ?? null, pct, achieved: latest != null && latest >= goal.target, measurements: after.length };
}

/**
 * Default questions for a pulse: for each focus competency (active goals first, then the blind
 * spot and growth areas), its lowest-rated statements, until `max` are chosen (at least `min`).
 */
export function defaultPulseQuestions(report: ReportData, goalKeys: string[], max = 10, min = 5): string[] {
  const focus = [...new Set([...goalKeys, ...(report.summary.blindSpot ? [report.summary.blindSpot] : []), ...report.summary.growthAreas])];
  const byComp = (k: string) =>
    report.questions.filter((q) => q.competencyKey === k).sort((a, b) => (a.others.mean ?? 99) - (b.others.mean ?? 99) || a.id.localeCompare(b.id));
  const perComp = Math.max(2, Math.floor(max / Math.max(1, focus.length)));
  const picked: string[] = [];
  for (const k of focus) for (const q of byComp(k).slice(0, perComp)) if (picked.length < max && !picked.includes(q.id)) picked.push(q.id);
  // Top up from the lowest-rated remaining statements if focus areas had too few.
  if (picked.length < min) {
    for (const q of [...report.questions].sort((a, b) => (a.others.mean ?? 99) - (b.others.mean ?? 99))) {
      if (picked.length >= min) break;
      if (!picked.includes(q.id)) picked.push(q.id);
    }
  }
  return picked;
}
