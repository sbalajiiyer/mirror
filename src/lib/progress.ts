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
  /** Report-level competency averages (all statements in that assessment). */
  competencies: Record<string, { name: string; others: number | null; self: number | null }>;
  /** Per-statement averages keyed by a key that is stable across a series. */
  questions: Record<string, { competencyKey: string; others: number | null; self: number | null }>;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);

export function toSeriesPoint(a: { id: string; title: string; type: "FULL_360" | "PULSE"; closedAt: Date | string }, report: ReportData): SeriesPoint | null {
  if (!report.anonymity.available) return null;
  const competencies: SeriesPoint["competencies"] = {};
  for (const c of report.competencies) competencies[c.key] = { name: c.name, others: c.others.mean, self: c.self };
  const questions: SeriesPoint["questions"] = {};
  for (const q of report.questions) questions[q.key ?? `${q.competencyKey}:${q.text}`] = { competencyKey: q.competencyKey, others: q.others.mean, self: q.self };
  return { assessmentId: a.id, title: a.title, type: a.type, date: new Date(a.closedAt).toISOString(), raters: report.anonymity.othersN, competencies, questions };
}

/** Statement keys of a competency that have a visible others' average in this point. */
function keysFor(p: SeriesPoint, comp: string) {
  return new Set(Object.entries(p.questions).filter(([, q]) => q.competencyKey === comp && q.others != null).map(([k]) => k));
}

/**
 * Average of a competency over a fixed set of statements. Comparisons always use the
 * statements both check-ins share, because a pulse usually re-asks only some of them.
 */
export function valueOn(p: SeriesPoint, keys: Set<string>) {
  const qs = [...keys].map((k) => p.questions[k]).filter(Boolean);
  return {
    others: r2(mean(qs.map((q) => q.others).filter((x): x is number => x != null))),
    self: r2(mean(qs.map((q) => q.self).filter((x): x is number => x != null))),
  };
}

function intersect(sets: Set<string>[]) {
  if (!sets.length) return new Set<string>();
  return new Set([...sets[0]].filter((k) => sets.every((s) => s.has(k))));
}

/**
 * One row per check-in (oldest first) with a column per competency, measured on the statements
 * common to every check-in that included that competency.
 */
export function trendRows(points: SeriesPoint[]) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const names = new Map<string, string>();
  for (const p of sorted) for (const [k, v] of Object.entries(p.competencies)) names.set(k, v.name);
  const comps = [...names.entries()].map(([key, name]) => {
    const measuring = sorted.filter((p) => keysFor(p, key).size > 0);
    const common = intersect(measuring.map((p) => keysFor(p, key)));
    return { key, name, measured: common.size ? measuring.length : 0, statements: common.size, common };
  });
  const rows = sorted.map((p) => {
    const row: Record<string, number | null | string> = { assessmentId: p.assessmentId, label: p.title, date: p.date, type: p.type };
    for (const c of comps) {
      if (!c.common.size || !keysFor(p, c.key).size) continue;
      const v = valueOn(p, c.common);
      row[`${c.key}:others`] = v.others;
      row[`${c.key}:self`] = v.self;
    }
    return row;
  });
  return {
    competencies: comps.map(({ key, name, measured, statements }) => ({ key, name, measured, statements })),
    rows: rows as ({ assessmentId: string; label: string; date: string; type: string } & Record<string, number | null | string>)[],
  };
}

/** Before/after on the competencies both measured, using only the statements both asked. */
export function compare(before: SeriesPoint, after: SeriesPoint) {
  const names = { ...Object.fromEntries(Object.entries(before.competencies).map(([k, v]) => [k, v.name])), ...Object.fromEntries(Object.entries(after.competencies).map(([k, v]) => [k, v.name])) };
  return Object.keys(names)
    .map((k) => {
      const common = intersect([keysFor(before, k), keysFor(after, k)]);
      if (!common.size) return null;
      const b = valueOn(before, common).others!;
      const a = valueOn(after, common).others!;
      return { key: k, name: names[k], before: b, after: a, delta: Math.round((a - b) * 100) / 100, statements: common.size };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
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

export type GoalProgress = { baselineNow: number | null; latest: number | null; latestDate: string | null; pct: number; achieved: boolean; measurements: number };

/**
 * Progress from baseline to target. The baseline is re-measured on the same statements as the
 * latest check-in (the 360 measured more statements than a pulse re-asks), so it's like-for-like.
 */
export function goalProgress(goal: { competencyKey: string; baseline: number | null; target: number; createdAt: Date | string }, points: SeriesPoint[]): GoalProgress {
  const created = new Date(goal.createdAt).toISOString();
  const measuring = [...points].filter((p) => keysFor(p, goal.competencyKey).size > 0).sort((a, b) => a.date.localeCompare(b.date));
  const basePoint = [...measuring].reverse().find((p) => p.date <= created) ?? null;
  const after = measuring.filter((p) => p.date > created && p !== basePoint);
  const last = after[after.length - 1];
  if (!last) return { baselineNow: goal.baseline, latest: null, latestDate: null, pct: 0, achieved: false, measurements: 0 };
  const common = basePoint ? intersect([keysFor(basePoint, goal.competencyKey), keysFor(last, goal.competencyKey)]) : keysFor(last, goal.competencyKey);
  const latest = valueOn(last, common.size ? common : keysFor(last, goal.competencyKey)).others;
  const base = basePoint && common.size ? valueOn(basePoint, common).others : goal.baseline;
  const span = goal.target - (base ?? goal.target);
  const pct = latest == null ? 0 : span <= 0 ? 100 : Math.max(0, Math.min(100, Math.round(((latest - (base ?? 0)) / span) * 100)));
  return { baselineNow: base, latest, latestDate: last.date, pct, achieved: latest != null && latest >= goal.target, measurements: after.length };
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
