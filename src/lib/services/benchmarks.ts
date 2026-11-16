// Server-side only (used by pages, the cron job and the seed script).
import { db } from "@/lib/db";
import { CORE_360 } from "@/lib/frameworks/core-360";
import type { ReportData } from "@/lib/report/compute";
import { bandLabel, computeNorms, percentileOf, sliceLabel, type BenchmarkEntry } from "@/lib/benchmarks";

/*
 * Benchmark norms (owner decision 2026-11-16: opt-out, large groups). Each person's latest full 360
 * on the built-in framework counts once, anonymously, unless they opted out in Settings. Norms are
 * stored as percentiles only; "Everyone" needs ≥ 30 people and a slice ≥ 10.
 */

export async function rebuildNorms() {
  const reports = await db.assessment.findMany({
    where: { status: "CLOSED", type: "FULL_360", framework: { isBuiltIn: true, slug: CORE_360.slug }, subject: { profile: { benchmarkOptOut: false } } },
    orderBy: { closedAt: "desc" },
    include: { reports: { orderBy: { generatedAt: "desc" }, take: 1, select: { data: true } }, subject: { include: { profile: true } } },
  });
  const seen = new Set<string>();
  const entries: BenchmarkEntry[] = [];
  for (const a of reports) {
    if (seen.has(a.subjectId)) continue; // latest full 360 per person
    const d = a.reports[0]?.data as unknown as ReportData | undefined;
    if (!d?.anonymity.available || d.assessment.scaleMax !== 5) continue;
    seen.add(a.subjectId);
    entries.push({
      scores: Object.fromEntries(d.competencies.filter((c) => c.others.mean != null).map((c) => [c.key, c.others.mean!])),
      seniority: a.subject.profile?.seniority || null,
      goal: a.goal,
    });
  }
  const norms = computeNorms(entries);
  await db.$transaction([
    db.benchmarkNorm.deleteMany({ where: { frameworkSlug: CORE_360.slug } }),
    db.benchmarkNorm.createMany({ data: norms.map((n) => ({ ...n, frameworkSlug: CORE_360.slug })) }),
  ]);
  return { people: entries.length, norms: norms.length };
}

export type BenchmarkRow = { key: string; name: string; you: number; norm: { slice: string; label: string; n: number; p25: number; p50: number; p75: number }; percentile: number; band: string };

/** A report's competencies against the best available norm (career-stage slice if big enough, else everyone). */
export async function benchmarkForReport(report: ReportData, seniority?: string | null): Promise<{ available: boolean; rows: BenchmarkRow[]; people: number | null }> {
  const norms = await db.benchmarkNorm.findMany({ where: { frameworkSlug: CORE_360.slug, slice: { in: ["all", ...(seniority ? [`seniority:${seniority}`] : [])] } } });
  if (report.assessment.scaleMax !== 5) return { available: false, rows: [], people: null };
  const rows: BenchmarkRow[] = [];
  for (const c of report.competencies) {
    if (c.others.mean == null) continue;
    const n = norms.find((x) => x.competencyKey === c.key && x.slice === `seniority:${seniority}`) ?? norms.find((x) => x.competencyKey === c.key && x.slice === "all");
    if (!n) continue;
    const pct = percentileOf(c.others.mean, n);
    rows.push({ key: c.key, name: c.name, you: c.others.mean, norm: { slice: n.slice, label: sliceLabel(n.slice), n: n.n, p25: n.p25, p50: n.p50, p75: n.p75 }, percentile: pct, band: bandLabel(pct) });
  }
  const all = norms.filter((x) => x.slice === "all");
  return { available: rows.length > 0, rows, people: all.length ? Math.max(...all.map((x) => x.n)) : null };
}
