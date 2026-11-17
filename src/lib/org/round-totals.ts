/**
 * Pure helpers for frozen round totals (Phase 11). Isomorphic and dependency-free so they can be
 * unit tested. Totals are sums and counts only; the profile they produce matches `groupProfile`.
 */
import type { ReportData } from "@/lib/report/compute";
import { ORG_FLOOR, type GroupProfile } from "./analytics";

export type CompetencyTotals = { name: string; n: number; sum: number; sumSq: number; selfN: number; selfSum: number };
export type RoundTotals = { people: number; competencies: Record<string, CompetencyTotals>; overallN: number; overallSum: number };

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Returns new totals with one person's report added. Does not mutate `t`. */
export function addToTotals(t: RoundTotals, r: ReportData): RoundTotals {
  const competencies: Record<string, CompetencyTotals> = { ...(t.competencies ?? {}) };
  for (const c of r.competencies) {
    const cur = competencies[c.key] ?? { name: c.name, n: 0, sum: 0, sumSq: 0, selfN: 0, selfSum: 0 };
    const next = { ...cur };
    if (c.others.mean != null) {
      next.n += 1;
      next.sum += c.others.mean;
      next.sumSq += c.others.mean ** 2;
      if (c.self != null) {
        next.selfN += 1;
        next.selfSum += c.self;
      }
    }
    competencies[c.key] = next;
  }
  const o = r.summary.overallOthers;
  return { people: (t.people ?? 0) + 1, competencies, overallN: (t.overallN ?? 0) + (o != null ? 1 : 0), overallSum: (t.overallSum ?? 0) + (o ?? 0) };
}

/** Same rules as `groupProfile`: every figure needs `min` people (never below ORG_FLOOR). */
export function profileFromTotals(t: RoundTotals, min: number): GroupProfile {
  const m = Math.max(ORG_FLOOR, min);
  if (t.people < m) return { people: t.people, available: false, competencies: [], overall: null };
  const competencies = Object.entries(t.competencies ?? {})
    .filter(([, c]) => c.n >= m)
    .map(([key, c]) => {
      const mean = c.sum / c.n;
      const variance = c.n > 1 ? Math.max(0, (c.sumSq - c.n * mean * mean) / (c.n - 1)) : 0;
      return { key, name: c.name, people: c.n, others: round2(mean), self: c.selfN >= m ? round2(c.selfSum / c.selfN) : null, spread: round2(Math.sqrt(variance)) };
    });
  return { people: t.people, available: competencies.length > 0, competencies, overall: t.overallN > 0 ? round2(t.overallSum / t.overallN) : null };
}
