/**
 * Organization analytics (Phase 6). Pure functions over members' frozen, anonymised reports.
 *
 * Privacy rules enforced here (and only data from here reaches an admin):
 * - every group-level figure needs at least `min` people (never below 5);
 * - a member appears by name only if they opted in (`named`);
 * - everyone else is folded into one "Others" row, shown only if that row itself has `min` people.
 */
import type { ReportData } from "@/lib/report/compute";

export const ORG_FLOOR = 5;
export const minFor = (orgMin: number) => Math.max(ORG_FLOOR, orgMin);

export type MemberReport = { memberId: string; name: string; named: boolean; report: ReportData };

const round2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function sd(xs: number[]) {
  const m = mean(xs);
  if (m == null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

function competencyNames(reports: ReportData[]) {
  const names = new Map<string, string>();
  for (const r of reports) for (const c of r.competencies) if (!names.has(c.key)) names.set(c.key, c.name);
  return names;
}

export type GroupProfile = {
  people: number;
  available: boolean;
  competencies: { key: string; name: string; people: number; others: number; self: number | null; spread: number | null }[];
  overall: number | null;
};

/** Average of members' "others" scores per competency; each competency needs `min` people. */
export function groupProfile(reports: ReportData[], min: number): GroupProfile {
  const m = Math.max(ORG_FLOOR, min);
  const names = competencyNames(reports);
  const competencies = [...names.entries()]
    .map(([key, name]) => {
      const vals = reports.map((r) => r.competencies.find((c) => c.key === key)).filter((c) => c && c.others.mean != null);
      const others = vals.map((c) => c!.others.mean!);
      const selfs = vals.map((c) => c!.self).filter((x): x is number => x != null);
      return { key, name, people: others.length, others: round2(mean(others) ?? 0), self: selfs.length >= m ? round2(mean(selfs)!) : null, spread: others.length >= m ? round2(sd(others) ?? 0) : null };
    })
    .filter((c) => c.people >= m);
  const overall = mean(reports.map((r) => r.summary.overallOthers).filter((x): x is number => x != null));
  return { people: reports.length, available: reports.length >= m && competencies.length > 0, competencies: reports.length >= m ? competencies : [], overall: reports.length >= m && overall != null ? round2(overall) : null };
}

export type HeatmapRow = { label: string; people: number; named: boolean; memberId?: string; values: Record<string, number | null> };

/** Members × competencies: opted-in members by name; everyone else as one "Others" row (if large enough). */
export function teamHeatmap(members: MemberReport[], min: number): { competencies: { key: string; name: string }[]; rows: HeatmapRow[]; hiddenPeople: number } {
  const m = Math.max(ORG_FLOOR, min);
  const names = competencyNames(members.map((x) => x.report));
  const comps = [...names.entries()].map(([key, name]) => ({ key, name }));
  const rows: HeatmapRow[] = [];
  // Named rows are only safe when the remainder is either empty or itself big enough.
  const named = members.filter((x) => x.named);
  const rest = members.filter((x) => !x.named);
  const restOk = rest.length === 0 || rest.length >= m;
  if (members.length < m) return { competencies: comps, rows: [], hiddenPeople: members.length };
  if (restOk) {
    for (const x of named) rows.push({ label: x.name, people: 1, named: true, memberId: x.memberId, values: Object.fromEntries(comps.map((c) => [c.key, x.report.competencies.find((k) => k.key === c.key)?.others.mean ?? null])) });
    if (rest.length) {
      const p = groupProfile(rest.map((x) => x.report), m);
      rows.push({ label: named.length ? `Others (${rest.length})` : `Whole team (${rest.length})`, people: rest.length, named: false, values: Object.fromEntries(comps.map((c) => [c.key, p.competencies.find((k) => k.key === c.key)?.others ?? null])) });
    }
    return { competencies: comps, rows, hiddenPeople: 0 };
  }
  // Too few non-consenting people to fold safely: show only the whole-team average.
  const p = groupProfile(members.map((x) => x.report), m);
  rows.push({ label: `Whole team (${members.length})`, people: members.length, named: false, values: Object.fromEntries(comps.map((c) => [c.key, p.competencies.find((k) => k.key === c.key)?.others ?? null])) });
  return { competencies: comps, rows, hiddenPeople: named.length };
}

export type Comparison = {
  a: { label: string; people: number };
  b: { label: string; people: number };
  available: boolean;
  rows: { key: string; name: string; a: number; b: number; delta: number }[];
};

/** Cohort vs cohort, or before vs after (same cohort, two campaigns). Each side needs `min` people. */
export function compareGroups(a: { label: string; reports: ReportData[] }, b: { label: string; reports: ReportData[] }, min: number): Comparison {
  const pa = groupProfile(a.reports, min);
  const pb = groupProfile(b.reports, min);
  const rows = pa.competencies
    .map((c) => {
      const o = pb.competencies.find((x) => x.key === c.key);
      return o ? { key: c.key, name: c.name, a: c.others, b: o.others, delta: round2(o.others - c.others) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((x, y) => y.delta - x.delta);
  return { a: { label: a.label, people: a.reports.length }, b: { label: b.label, people: b.reports.length }, available: pa.available && pb.available && rows.length > 0, rows };
}

/** Org-wide strengths (top 3) and gaps (bottom 3) by others' average. */
export function strengthsAndGaps(p: GroupProfile) {
  const sorted = [...p.competencies].sort((x, y) => y.others - x.others);
  return { strengths: sorted.slice(0, 3), gaps: sorted.slice(-3).reverse() };
}

export type NineBoxMember = { memberId: string; name: string; score: number | null; scaleMax: number; performance: number | null };
export type NineBox = { cells: { performance: 1 | 2 | 3; behaviours: 1 | 2 | 3; members: { memberId: string; name: string; score: number }[] }[]; unplaced: { memberId: string; name: string; reason: string }[] };

/** Behaviour band from a 360 score: thirds of the scale above 1 (on 1–5: <3.0, 3.0–3.99, ≥4.0). */
export function behaviourBand(score: number, scaleMax: number): 1 | 2 | 3 {
  const t = (score - 1) / (scaleMax - 1);
  return t >= 0.75 ? 3 : t >= 0.5 ? 2 : 1;
}

/** Talent grid of consenting members: x = admin-entered performance, y = 360 behaviours band. */
export function nineBox(members: NineBoxMember[]): NineBox {
  const cells: NineBox["cells"] = [];
  for (const p of [3, 2, 1] as const) for (const b of [1, 2, 3] as const) cells.push({ performance: b, behaviours: p, members: [] });
  const unplaced: NineBox["unplaced"] = [];
  for (const m of members) {
    if (m.score == null) unplaced.push({ memberId: m.memberId, name: m.name, reason: "No completed 360 with visible results yet" });
    else if (m.performance == null) unplaced.push({ memberId: m.memberId, name: m.name, reason: "No performance rating entered" });
    else cells.find((c) => c.performance === m.performance && c.behaviours === behaviourBand(m.score!, m.scaleMax))!.members.push({ memberId: m.memberId, name: m.name, score: m.score });
  }
  return { cells, unplaced };
}

export type Participation = { invited: number; started: number; selfDone: number; launched: number; closed: number; raterInvites: number; raterResponses: number };

export function participation(
  members: number,
  assessments: { status: string; selfLockedAt: Date | null; invites: { status: string }[] }[],
): Participation {
  return {
    invited: members,
    started: assessments.length,
    selfDone: assessments.filter((a) => a.selfLockedAt).length,
    launched: assessments.filter((a) => a.status === "COLLECTING" || a.status === "CLOSED").length,
    closed: assessments.filter((a) => a.status === "CLOSED").length,
    raterInvites: assessments.reduce((n, a) => n + a.invites.length, 0),
    raterResponses: assessments.reduce((n, a) => n + a.invites.filter((i) => i.status === "SUBMITTED").length, 0),
  };
}
