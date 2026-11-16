/**
 * Session-prep briefing and cross-client analytics for coaches. Pure functions over report data the
 * client has chosen to share (already anonymised), so nothing here can reveal more than the reports.
 */
import type { ReportData } from "@/lib/report/compute";
import { compare, type GoalProgress, type SeriesPoint } from "@/lib/progress";

/** Open, non-judgemental coaching questions per built-in competency (plus a generic fallback). */
export const QUESTION_BANK: Record<string, string[]> = {
  communication: [
    "When did your message land exactly as you intended recently? What made the difference?",
    "Who most needs to hear from you more often, and what stops that today?",
    "How do you check that people understood what you meant, not just what you said?",
  ],
  leadership: [
    "Which decisions could your team make without you next month?",
    "What does good delegation look like for you, and where do you hold on too long?",
    "How would your team describe the direction you're setting right now?",
  ],
  execution: [
    "What are you saying yes to that should be a no or a later?",
    "Where do commitments slip, and what's the earliest signal you could catch?",
    "What would 'done well enough' look like for the thing you're working on now?",
  ],
  collaboration: [
    "Which relationship, if it improved, would make the biggest difference to your work?",
    "How do you handle disagreement with peers, and what would you like to do differently?",
    "Where could you share credit or context more generously?",
  ],
  strategic_thinking: [
    "What will matter most in your area a year from now, and how are you preparing for it?",
    "How do you make time to step back from day-to-day work?",
    "Which trade-off are you avoiding making explicit?",
  ],
  emotional_intelligence: [
    "What situations tend to pull you off balance, and what helps you recover?",
    "How do you notice how others are feeling in a meeting?",
    "When did you last ask for feedback in the moment? What happened?",
  ],
  growth_mindset: [
    "What did you learn from your most recent setback?",
    "Which skill are you deliberately practising right now?",
    "How do you react when someone challenges your approach?",
  ],
};
const GENERIC = [
  "What stands out to you most in this feedback, and why?",
  "What would you like people to say about you in this area six months from now?",
  "What's one small experiment you could try before we next meet?",
];

export function questionsFor(competencyKey: string, name: string): string[] {
  return QUESTION_BANK[competencyKey] ?? GENERIC.map((q) => q.replace("this area", name));
}

export type Brief = {
  clientFirstName: string;
  basedOn: { assessmentId: string; title: string; label: string; date: string; raters: number } | null;
  headline: string;
  strengths: string[];
  growthAreas: string[];
  blindSpot: string | null;
  hiddenStrength: string | null;
  changes: { name: string; before: number; after: number; delta: number; statements: number }[];
  comparedWith: string | null;
  goals: { title: string; pct: number; achieved: boolean; latest: number | null; target: number }[];
  openSession: string | null;
  questions: { competency: string; question: string }[];
};

export function buildBrief(input: {
  clientFirstName: string;
  latest: { report: ReportData; label: string; date: string; point: SeriesPoint | null } | null;
  previous: { label: string; point: SeriesPoint | null } | null;
  goals: { title: string; target: number; progress: GoalProgress }[];
  openSession: string | null;
}): Brief {
  const { latest } = input;
  if (!latest) {
    return {
      clientFirstName: input.clientFirstName,
      basedOn: null,
      headline: `${input.clientFirstName} hasn't shared a completed report yet.`,
      strengths: [],
      growthAreas: [],
      blindSpot: null,
      hiddenStrength: null,
      changes: [],
      comparedWith: null,
      goals: [],
      openSession: input.openSession,
      questions: GENERIC.map((q) => ({ competency: "General", question: q })),
    };
  }
  const r = latest.report;
  const name = (k: string | null) => (k ? (r.competencies.find((c) => c.key === k)?.name ?? k) : null);
  const changes = latest.point && input.previous?.point ? compare(input.previous.point, latest.point) : [];
  const focus = [...new Set([r.summary.blindSpot, ...r.summary.growthAreas].filter((k): k is string => !!k))].slice(0, 3);
  const questions = focus.flatMap((k) => questionsFor(k, name(k)!).slice(0, 2).map((q) => ({ competency: name(k)!, question: q })));
  const up = changes.filter((c) => c.delta >= 0.2);
  const down = changes.filter((c) => c.delta <= -0.2);
  const headline = [
    `${input.clientFirstName}'s latest feedback (${latest.label}) is strongest in ${r.summary.strengths.map(name).join(" and ") || "no single area"}.`,
    r.summary.blindSpot ? `Possible blind spot: ${name(r.summary.blindSpot)} (rates themselves higher than others do).` : "",
    up.length ? `Improved since ${input.previous!.label}: ${up.map((c) => c.name).join(", ")}.` : "",
    down.length ? `Dipped: ${down.map((c) => c.name).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    clientFirstName: input.clientFirstName,
    basedOn: { assessmentId: r.assessment.id, title: r.assessment.title, label: latest.label, date: latest.date, raters: r.anonymity.othersN },
    headline,
    strengths: r.summary.strengths.map((k) => name(k)!),
    growthAreas: r.summary.growthAreas.map((k) => name(k)!),
    blindSpot: name(r.summary.blindSpot),
    hiddenStrength: name(r.summary.hiddenStrength),
    changes,
    comparedWith: changes.length ? input.previous!.label : null,
    goals: input.goals.map((g) => ({ title: g.title, pct: g.progress.pct, achieved: g.progress.achieved, latest: g.progress.latest, target: g.target })),
    openSession: input.openSession,
    questions: questions.length ? questions : GENERIC.map((q) => ({ competency: "General", question: q })),
  };
}

/** Minimum number of clients before any cross-client figure is shown. */
export const MIN_CLIENTS = 5;

export type ClientSnapshot = {
  /** Latest full report with visible results. */
  latest: ReportData;
  /** Earliest full report with visible results, when different from latest. */
  first: ReportData | null;
};

export type CrossClient = {
  clients: number;
  available: boolean;
  blindSpots: { key: string; name: string; clients: number }[];
  growthAreas: { key: string; name: string; clients: number }[];
  distribution: { key: string; name: string; clients: number; mean: number; min: number; max: number }[];
  improvement: { key: string; name: string; clients: number; meanDelta: number }[];
  improvementAvailable: boolean;
};

const round2 = (x: number) => Math.round(x * 100) / 100;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function crossClient(snapshots: ClientSnapshot[]): CrossClient {
  const n = snapshots.length;
  const names = new Map<string, string>();
  for (const s of snapshots) for (const c of s.latest.competencies) names.set(c.key, c.name);
  const count = (pick: (r: ReportData) => string[]) => {
    const m = new Map<string, number>();
    for (const s of snapshots) for (const k of new Set(pick(s.latest))) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].map(([key, clients]) => ({ key, name: names.get(key) ?? key, clients })).sort((a, b) => b.clients - a.clients || a.name.localeCompare(b.name));
  };
  const distribution = [...names.entries()]
    .map(([key, name]) => {
      const xs = snapshots.map((s) => s.latest.competencies.find((c) => c.key === key)?.others.mean).filter((x): x is number => x != null);
      return { key, name, clients: xs.length, mean: xs.length ? round2(avg(xs)) : 0, min: xs.length ? Math.min(...xs) : 0, max: xs.length ? Math.max(...xs) : 0 };
    })
    // Each figure needs enough clients behind it, not just the page as a whole.
    .filter((d) => d.clients >= MIN_CLIENTS)
    .sort((a, b) => b.mean - a.mean);
  const withFirst = snapshots.filter((s) => s.first);
  const improvement = [...names.entries()]
    .map(([key, name]) => {
      const ds = withFirst
        .map((s) => {
          const a = s.first!.competencies.find((c) => c.key === key)?.others.mean;
          const b = s.latest.competencies.find((c) => c.key === key)?.others.mean;
          return a != null && b != null ? b - a : null;
        })
        .filter((x): x is number => x != null);
      return { key, name, clients: ds.length, meanDelta: ds.length ? round2(avg(ds)) : 0 };
    })
    .filter((d) => d.clients >= MIN_CLIENTS)
    .sort((a, b) => b.meanDelta - a.meanDelta);
  return {
    clients: n,
    available: n >= MIN_CLIENTS,
    blindSpots: n >= MIN_CLIENTS ? count((r) => (r.summary.blindSpot ? [r.summary.blindSpot] : [])) : [],
    growthAreas: n >= MIN_CLIENTS ? count((r) => r.summary.growthAreas) : [],
    distribution: n >= MIN_CLIENTS ? distribution : [],
    improvement: n >= MIN_CLIENTS ? improvement : [],
    improvementAvailable: withFirst.length >= MIN_CLIENTS,
  };
}

/** Remove every verbatim comment from a report (used when the client doesn't share comments). */
export function withoutComments(r: ReportData): ReportData & { commentsHidden: true } {
  const themes = r.comments.themes.map((t) => ({ ...t, comments: [] }));
  const ssc = Object.fromEntries((["START", "STOP", "CONTINUE"] as const).map((k) => [k, r.comments.ssc[k].map((t) => ({ ...t, comments: [] }))])) as unknown as ReportData["comments"]["ssc"];
  return { ...r, comments: { themes, competency: {}, ssc, wordCloud: [], total: r.comments.total }, commentsHidden: true };
}
