/**
 * Benchmarks (Phase 8). Pure helpers: build percentile norms from anonymous score sets, and place a
 * score within a norm. Only percentiles leave this module, never individual values.
 */

export const BENCHMARK_MIN = 30; // people behind an "everyone" norm
export const SLICE_MIN = 10; // people behind a slice (career stage, goal)

export type BenchmarkEntry = { scores: Record<string, number>; seniority?: string | null; goal?: string | null };
export type Norm = { competencyKey: string; slice: string; n: number; mean: number; p10: number; p25: number; p50: number; p75: number; p90: number };

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Linear-interpolated percentile of a sorted array (p in 0..100). */
export function quantile(sorted: number[], p: number) {
  if (!sorted.length) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeNorms(entries: BenchmarkEntry[], min = BENCHMARK_MIN, sliceMin = SLICE_MIN): Norm[] {
  const slices = new Map<string, BenchmarkEntry[]>();
  const add = (k: string, e: BenchmarkEntry) => slices.set(k, [...(slices.get(k) ?? []), e]);
  for (const e of entries) {
    add("all", e);
    if (e.seniority) add(`seniority:${e.seniority}`, e);
    if (e.goal) add(`goal:${e.goal}`, e);
  }
  const out: Norm[] = [];
  for (const [slice, es] of slices) {
    const need = slice === "all" ? min : sliceMin;
    const comps = new Set(es.flatMap((e) => Object.keys(e.scores)));
    for (const k of comps) {
      const vals = es.map((e) => e.scores[k]).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
      if (vals.length < need) continue;
      out.push({
        competencyKey: k,
        slice,
        n: vals.length,
        mean: r2(vals.reduce((a, b) => a + b, 0) / vals.length),
        p10: r2(quantile(vals, 10)),
        p25: r2(quantile(vals, 25)),
        p50: r2(quantile(vals, 50)),
        p75: r2(quantile(vals, 75)),
        p90: r2(quantile(vals, 90)),
      });
    }
  }
  return out;
}

/** Approximate percentile of `value` from a norm's stored percentiles (piecewise linear, clamped 1–99). */
export function percentileOf(value: number, n: Pick<Norm, "p10" | "p25" | "p50" | "p75" | "p90">) {
  const pts: [number, number][] = [
    [n.p10, 10],
    [n.p25, 25],
    [n.p50, 50],
    [n.p75, 75],
    [n.p90, 90],
  ];
  // Tails: interpolate to the scale ends (1 and 5 on the built-in 1–5 scale).
  if (value <= pts[0][0]) return Math.max(1, Math.round((10 * (value - 1)) / Math.max(0.01, pts[0][0] - 1)));
  if (value >= pts[4][0]) return Math.min(99, 90 + Math.round((9 * (value - pts[4][0])) / Math.max(0.01, 5 - pts[4][0])));
  for (let i = 0; i < pts.length - 1; i++) {
    const [v0, q0] = pts[i];
    const [v1, q1] = pts[i + 1];
    if (value >= v0 && value <= v1) return Math.round(v1 === v0 ? (q0 + q1) / 2 : q0 + ((value - v0) / (v1 - v0)) * (q1 - q0));
  }
  return 50;
}

export function bandLabel(pct: number) {
  if (pct >= 90) return "Top 10%";
  if (pct >= 75) return "Top quarter";
  if (pct >= 50) return "Above the middle";
  if (pct >= 25) return "Below the middle";
  return "Bottom quarter";
}

export const sliceLabel = (slice: string) => (slice === "all" ? "Everyone" : slice.startsWith("seniority:") ? slice.slice(10) : slice.startsWith("goal:") ? `Goal: ${slice.slice(5)}` : slice);
