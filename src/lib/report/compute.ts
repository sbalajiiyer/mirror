/**
 * Report computation. Pure function: raw submissions in, anonymised report data out.
 * Output contains only aggregates that passed the rules in src/lib/anonymity.ts.
 */
import type { CommentKind } from "@prisma/client";
import {
  resolveReportingGroups,
  stableShuffle,
  suppressCells,
  type GroupInput,
  type ReportingGroup,
} from "@/lib/anonymity";
import { groupComments, wordFrequencies, type ThemeGroup } from "@/lib/text/themes";
import { GAP_THRESHOLD } from "@/lib/report/constants";

export type ReportInput = {
  assessment: {
    id: string;
    title: string;
    goal: string;
    scaleMax: number;
    minRatersPerGroup: number;
    /** Ignored since 2026-11-18 (no manager exception); optional for old callers. */
    showManagerSeparately?: boolean;
    subjectFirstName: string;
  };
  groups: GroupInput[];
  /** Invitations per rater group id; a group is shown on its own only with min + INVITE_MARGIN of them. */
  invited?: Record<string, number>;
  questions: { id: string; competencyKey: string; competency: string; questionKey?: string | null; text: string; order: number; type: "RATING" | "OPEN_TEXT" }[];
  submissions: {
    id: string;
    groupId: string;
    isSelf: boolean;
    responses: { questionId: string; value: number | null }[];
    comments: { kind: CommentKind; competencyKey: string | null; text: string }[];
  }[];
};

export type Cell = { mean: number | null; n: number; suppressed: boolean };
export type Quadrant = "open_strength" | "blind_spot" | "hidden_strength" | "development_area";

export type CompetencyResult = {
  key: string;
  name: string;
  self: number | null;
  others: Cell;
  byGroup: Record<string, Cell>;
  /** self − others (positive = rates self higher than others do). */
  gap: number | null;
  quadrant: Quadrant | null;
};

export type QuestionResult = {
  id: string;
  /** Stable across assessments in a series (framework question key, or the text). */
  key?: string;
  competencyKey: string;
  text: string;
  self: number | null;
  others: Cell;
  byGroup: Record<string, Cell>;
  /** counts of others' ratings for 1..scaleMax (only when others cell is visible). */
  distribution: number[] | null;
  stdDev: number | null;
  agreement: "high" | "medium" | "low" | null;
};

export type SscBoard = Record<"START" | "STOP" | "CONTINUE", ThemeGroup[]>;

export type ReportData = {
  version: 1;
  assessment: { id: string; title: string; goal: string; subjectFirstName: string; scaleMax: number };
  anonymity: {
    min: number;
    othersN: number;
    selfCompleted: boolean;
    available: boolean;
    groups: Pick<ReportingGroup, "id" | "label" | "n" | "exempt">[];
    notes: string[];
  };
  competencies: CompetencyResult[];
  questions: QuestionResult[];
  summary: {
    strengths: string[];
    growthAreas: string[];
    blindSpot: string | null;
    hiddenStrength: string | null;
    narrative: string;
    overallOthers: number | null;
    overallSelf: number | null;
  };
  johari: { selfThreshold: number | null; othersThreshold: number | null };
  highest: string[];
  lowest: string[];
  comments: {
    themes: ThemeGroup[];
    competency: Record<string, { text: string; group: string }[]>;
    ssc: SscBoard;
    wordCloud: { word: string; count: number }[];
    total: number;
  };
};

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function stdDev(xs: number[]) {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export { GAP_THRESHOLD };

export function computeReport(input: ReportInput): ReportData {
  const { assessment } = input;
  const self = input.submissions.find((s) => s.isSelf) ?? null;
  const others = input.submissions.filter((s) => !s.isSelf);

  const counts: Record<string, number> = {};
  for (const s of others) counts[s.groupId] = (counts[s.groupId] ?? 0) + 1;
  const res = resolveReportingGroups({
    groups: input.groups,
    counts,
    invited: input.invited,
    minRaters: assessment.minRatersPerGroup,
  });
  const min = res.min;
  const rgOf = (s: { groupId: string }) => res.groupToReporting[s.groupId] ?? null;
  const exemptIds = new Set(res.reportingGroups.filter((r) => r.exempt).map((r) => r.id));
  const ratingQs = input.questions.filter((q) => q.type === "RATING").sort((a, b) => a.order - b.order);

  const base: ReportData = {
    version: 1,
    assessment: {
      id: assessment.id,
      title: assessment.title,
      goal: assessment.goal,
      subjectFirstName: assessment.subjectFirstName,
      scaleMax: assessment.scaleMax,
    },
    anonymity: {
      min,
      othersN: res.othersN,
      selfCompleted: !!self,
      available: res.othersVisible,
      groups: res.reportingGroups.map((r) => ({ id: r.id, label: r.label, n: r.n, exempt: r.exempt })),
      notes: res.notes,
    },
    competencies: [],
    questions: [],
    summary: { strengths: [], growthAreas: [], blindSpot: null, hiddenStrength: null, narrative: "", overallOthers: null, overallSelf: null },
    johari: { selfThreshold: null, othersThreshold: null },
    highest: [],
    lowest: [],
    comments: { themes: [], competency: {}, ssc: { START: [], STOP: [], CONTINUE: [] }, wordCloud: [], total: 0 },
  };
  if (!res.othersVisible) return base;

  const reportable = others.filter((s) => rgOf(s) !== null);
  const rgIds = res.reportingGroups.map((r) => r.id);

  /** Build "others" + per-group cells from (reportingGroup, value) pairs with suppression. */
  function cells(values: { rg: string; v: number }[]): { others: Cell; byGroup: Record<string, Cell> } {
    const byRg: Record<string, number[]> = {};
    for (const id of rgIds) byRg[id] = [];
    for (const x of values) byRg[x.rg].push(x.v);
    const hidden = suppressCells(
      rgIds.map((id) => ({ key: id, n: byRg[id].length, exempt: exemptIds.has(id) })),
      min,
    );
    const byGroup: Record<string, Cell> = {};
    for (const id of rgIds) {
      const xs = byRg[id];
      const sup = hidden.has(id);
      byGroup[id] = { mean: sup || !xs.length ? null : round(mean(xs)!), n: sup ? 0 : xs.length, suppressed: sup };
    }
    // "All others": hidden if the non-exempt part has 0 < n < min, or total < min.
    const all = values.map((x) => x.v);
    const nonExemptN = values.filter((x) => !exemptIds.has(x.rg)).length;
    const othersSup = all.length < min || (nonExemptN > 0 && nonExemptN < min);
    return { others: { mean: othersSup ? null : round(mean(all)!), n: othersSup ? 0 : all.length, suppressed: othersSup }, byGroup };
  }

  // ---- Questions -----------------------------------------------------------
  const selfVal = (qid: string) => self?.responses.find((r) => r.questionId === qid)?.value ?? null;
  const questions: QuestionResult[] = ratingQs.map((q) => {
    const vals: { rg: string; v: number }[] = [];
    for (const s of reportable) {
      const v = s.responses.find((r) => r.questionId === q.id)?.value;
      if (v != null) vals.push({ rg: rgOf(s)!, v });
    }
    const c = cells(vals);
    const visible = !c.others.suppressed;
    const xs = vals.map((x) => x.v);
    const sd = visible ? stdDev(xs) : null;
    const distribution = visible ? Array.from({ length: assessment.scaleMax }, (_, i) => xs.filter((x) => x === i + 1).length) : null;
    return {
      id: q.id,
      key: q.questionKey ? `${q.competencyKey}.${q.questionKey}` : `${q.competencyKey}:${q.text}`,
      competencyKey: q.competencyKey,
      text: q.text,
      self: selfVal(q.id),
      ...c,
      distribution,
      stdDev: sd === null ? null : round(sd),
      agreement: sd === null ? null : sd < 0.7 ? "high" : sd < 1.1 ? "medium" : "low",
    };
  });

  // ---- Competencies (rater-level average first, then across raters) ----------
  const compKeys = [...new Map(ratingQs.map((q) => [q.competencyKey, q.competency])).entries()];
  const competencies: CompetencyResult[] = compKeys.map(([key, name]) => {
    const qids = new Set(ratingQs.filter((q) => q.competencyKey === key).map((q) => q.id));
    const raterScore = (s: ReportInput["submissions"][number]) =>
      mean(s.responses.filter((r) => qids.has(r.questionId) && r.value != null).map((r) => r.value!));
    const vals: { rg: string; v: number }[] = [];
    for (const s of reportable) {
      const v = raterScore(s);
      if (v !== null) vals.push({ rg: rgOf(s)!, v });
    }
    const c = cells(vals);
    const selfScore = self ? raterScore(self) : null;
    const selfR = selfScore === null ? null : round(selfScore);
    return {
      key,
      name,
      self: selfR,
      ...c,
      gap: selfR !== null && c.others.mean !== null ? round(selfR - c.others.mean) : null,
      quadrant: null,
    };
  });

  // ---- Johari window: relative to the person's own averages -------------------
  const withBoth = competencies.filter((c) => c.self !== null && c.others.mean !== null);
  const selfT = mean(withBoth.map((c) => c.self!));
  const othersT = mean(withBoth.map((c) => c.others.mean!));
  for (const c of withBoth) {
    const sHigh = c.self! >= selfT!;
    const oHigh = c.others.mean! >= othersT!;
    c.quadrant = oHigh ? (sHigh ? "open_strength" : "hidden_strength") : sHigh ? "blind_spot" : "development_area";
  }

  // ---- Summary ---------------------------------------------------------------
  const ranked = competencies.filter((c) => c.others.mean !== null).sort((a, b) => b.others.mean! - a.others.mean!);
  const strengths = ranked.slice(0, 3).map((c) => c.key);
  const growthAreas = ranked
    .slice(-3)
    .reverse()
    .filter((c) => !strengths.includes(c.key))
    .map((c) => c.key);
  const byGap = withBoth.filter((c) => c.gap !== null).sort((a, b) => b.gap! - a.gap!);
  const blind = byGap[0] && byGap[0].gap! >= GAP_THRESHOLD ? byGap[0].key : null;
  const last = byGap[byGap.length - 1];
  const hidden = last && last.gap! <= -GAP_THRESHOLD ? last.key : null;
  const overallOthers = mean(ranked.map((c) => c.others.mean!));
  const overallSelf = mean(competencies.filter((c) => c.self !== null).map((c) => c.self!));

  const nameOf = (k: string | null) => competencies.find((c) => c.key === k)?.name.toLowerCase() ?? "";
  const narrativeParts = [
    `${res.othersN} people shared feedback.`,
    strengths.length ? `They see ${nameOf(strengths[0])}${strengths[1] ? ` and ${nameOf(strengths[1])}` : ""} as your clearest strengths.` : "",
    growthAreas.length ? `The biggest opportunity for growth is ${nameOf(growthAreas[0])}.` : "",
    blind ? `You rate yourself noticeably higher than others do on ${nameOf(blind)} — worth exploring.` : "",
    hidden ? `Others value your ${nameOf(hidden)} more than you give yourself credit for.` : "",
    !blind && !hidden && withBoth.length ? "Your self-view is closely aligned with how others see you." : "",
  ];

  // ---- Behaviours -------------------------------------------------------------
  const rankedQs = questions.filter((q) => q.others.mean !== null).sort((a, b) => b.others.mean! - a.others.mean! || a.id.localeCompare(b.id));
  const highest = rankedQs.slice(0, 5).map((q) => q.id);
  const lowest = rankedQs
    .slice(-5)
    .reverse()
    .filter((q) => !highest.includes(q.id))
    .map((q) => q.id);

  // ---- Comments (only from reportable groups, labelled by reporting group) -------
  const rgLabel = Object.fromEntries(res.reportingGroups.map((r) => [r.id, r.label]));
  // Comment-author rule: a reporting group's comments are quoted only if at least `min` different
  // people in it wrote comments. Otherwise they count towards themes but aren't shown word for word,
  // because with only one or two writers, style can give someone away.
  const writers = new Map<string, Set<string>>();
  for (const s of reportable) if (s.comments.some((c) => c.text.trim())) (writers.get(rgOf(s)!) ?? writers.set(rgOf(s)!, new Set()).get(rgOf(s)!)!).add(s.id);
  const quotable = (rg: string) => (writers.get(rg)?.size ?? 0) >= min;
  const all = reportable.flatMap((s) => s.comments.map((c) => ({ ...c, group: rgLabel[rgOf(s)!], sid: s.id, withheld: !quotable(rgOf(s)!) })));
  const withheldGroups = [...new Set(all.filter((c) => c.withheld).map((c) => c.group))];
  if (withheldGroups.length) base.anonymity.notes.push(`Comments from ${withheldGroups.join(", ")} are summarised as themes only, because fewer than ${min} people there wrote comments.`);
  const shuffled = stableShuffle(all, (c) => c.text);
  const pick = (kind: CommentKind) => shuffled.filter((c) => c.kind === kind).map((c) => ({ text: c.text, group: c.group, sid: c.sid, withheld: c.withheld }));
  const competencyComments: Record<string, { text: string; group: string }[]> = {};
  for (const c of shuffled.filter((c) => c.kind === "COMPETENCY" && c.competencyKey && !c.withheld)) {
    (competencyComments[c.competencyKey!] ??= []).push({ text: c.text, group: c.group });
  }
  const freeText = shuffled.filter((c) => c.kind === "GENERAL" || c.kind === "COMPETENCY");

  return {
    ...base,
    competencies,
    questions,
    summary: {
      strengths,
      growthAreas,
      blindSpot: blind,
      hiddenStrength: hidden,
      narrative: narrativeParts.filter(Boolean).join(" "),
      overallOthers: overallOthers === null ? null : round(overallOthers),
      overallSelf: overallSelf === null ? null : round(overallSelf),
    },
    johari: { selfThreshold: selfT === null ? null : round(selfT), othersThreshold: othersT === null ? null : round(othersT) },
    highest,
    lowest,
    comments: {
      themes: groupComments(freeText.map((c) => ({ text: c.text, group: c.group, sid: c.sid, withheld: c.withheld }))),
      competency: competencyComments,
      ssc: { START: groupComments(pick("START")), STOP: groupComments(pick("STOP")), CONTINUE: groupComments(pick("CONTINUE")) },
      wordCloud: wordFrequencies(
        shuffled.filter((c) => !c.withheld).map((c) => c.text),
        [assessment.subjectFirstName],
      ),
      total: shuffled.length,
    },
  };
}
