import type { ReportData } from "@/lib/report/compute";

/**
 * Group sessions across all of a subject's surveys by company, time period, theme or score.
 * Pure and isomorphic. Works only on what the subject's own reports already show, so it can't
 * reveal anything new about raters.
 */

export const GROUP_BYS = ["survey", "company", "year", "quarter", "theme", "score"] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

export const GROUP_BY_LABEL: Record<GroupBy, string> = {
  survey: "Survey",
  company: "Company",
  year: "Year",
  quarter: "Quarter",
  theme: "Theme",
  score: "Score range",
};

export type GroupableSession = {
  id: string;
  rootId: string;
  surveyTitle: string;
  sessionNumber: number;
  type: "FULL_360" | "PULSE";
  status: string;
  label: string | null;
  company: string | null;
  tags: string[];
  /** closedAt, else launchedAt, else createdAt (ISO). */
  date: string;
  /** Others' overall average from the frozen report, when visible. */
  score: number | null;
  scaleMax: number;
  /** Comment themes from the report (most-mentioned first) and growth/strength competency names. */
  themes: string[];
};

export type SessionGroup = { key: string; label: string; sessions: GroupableSession[]; avgScore: number | null };

export const NO_COMPANY = "No company set";
export const NO_SCORE = "No visible scores yet";
export const NO_THEME = "No themes yet";

export function normalizeTag(t: string) {
  return t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30);
}

export function parseTags(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(",");
  return [...new Set(parts.map(normalizeTag).filter(Boolean))].slice(0, 8);
}

/** Score bands of 0.5 on a 1–5 style scale, scaled to the session's own scale. */
export function scoreBand(score: number | null, scaleMax: number): { key: string; label: string } {
  if (score == null) return { key: "~none", label: NO_SCORE };
  const step = scaleMax <= 5 ? 0.5 : scaleMax <= 7 ? 1 : 2;
  const lo = Math.min(Math.floor(score / step) * step, scaleMax - step);
  const hi = lo + step;
  const f = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : x.toFixed(1));
  // Key sorts high scores first (inverted), and keeps different scales apart.
  return { key: `${String(scaleMax).padStart(2, "0")}:${String(Math.round((100 - lo) * 10)).padStart(5, "0")}`, label: `${f(lo)}–${f(hi)} out of ${scaleMax}` };
}

function quarterOf(iso: string) {
  const d = new Date(iso);
  return { year: d.getUTCFullYear(), q: Math.floor(d.getUTCMonth() / 3) + 1 };
}

/** The group keys one session belongs to. Theme groups may hold a session more than once (one per theme). */
export function keysFor(s: GroupableSession, by: GroupBy): { key: string; label: string }[] {
  switch (by) {
    case "survey":
      return [{ key: s.rootId, label: s.surveyTitle }];
    case "company":
      return s.company ? [{ key: `c:${s.company.toLowerCase()}`, label: s.company }] : [{ key: "~none", label: NO_COMPANY }];
    case "year": {
      const { year } = quarterOf(s.date);
      return [{ key: `y:${9999 - year}`, label: String(year) }];
    }
    case "quarter": {
      const { year, q } = quarterOf(s.date);
      return [{ key: `q:${9999 - year}-${5 - q}`, label: `Q${q} ${year}` }];
    }
    case "theme": {
      const all = [...new Set([...s.tags.map((t) => `#${t}`), ...s.themes])];
      return all.length ? all.map((t) => ({ key: `t:${t.toLowerCase()}`, label: t })) : [{ key: "~none", label: NO_THEME }];
    }
    case "score":
      return [scoreBand(s.score, s.scaleMax)];
  }
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

export function groupSessions(sessions: GroupableSession[], by: GroupBy): SessionGroup[] {
  const map = new Map<string, SessionGroup>();
  for (const s of sessions) {
    for (const { key, label } of keysFor(s, by)) {
      const g = map.get(key) ?? { key, label, sessions: [], avgScore: null };
      g.sessions.push(s);
      map.set(key, g);
    }
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.sessions.sort((a, b) => b.date.localeCompare(a.date) || b.sessionNumber - a.sessionNumber);
    g.avgScore = mean(g.sessions.map((s) => s.score).filter((x): x is number => x != null));
  }
  if (by === "survey") return groups.sort((a, b) => b.sessions[0].date.localeCompare(a.sessions[0].date));
  if (by === "theme" || by === "company")
    return groups.sort((a, b) => Number(a.key === "~none") - Number(b.key === "~none") || b.sessions.length - a.sessions.length || a.label.localeCompare(b.label));
  return groups.sort((a, b) => Number(a.key === "~none") - Number(b.key === "~none") || a.key.localeCompare(b.key));
}

export type SessionFilters = { company?: string; tag?: string; year?: string; minScore?: number; maxScore?: number };

export function filterSessions(sessions: GroupableSession[], f: SessionFilters): GroupableSession[] {
  return sessions.filter(
    (s) =>
      (!f.company || (f.company === NO_COMPANY ? !s.company : s.company?.toLowerCase() === f.company.toLowerCase())) &&
      (!f.tag || s.tags.includes(normalizeTag(f.tag))) &&
      (!f.year || String(new Date(s.date).getUTCFullYear()) === f.year) &&
      (f.minScore == null || (s.score != null && s.score >= f.minScore)) &&
      (f.maxScore == null || (s.score != null && s.score <= f.maxScore)),
  );
}

/** Themes a report contributes: up to 3 most-mentioned comment themes plus strengths and growth areas. */
export function reportThemes(report: {
  comments?: { themes?: { label: string; count: number }[] };
  summary?: { strengths?: string[]; growthAreas?: string[] };
  competencies?: { key: string; name: string }[];
}): string[] {
  const names = new Map((report.competencies ?? []).map((c) => [c.key, c.name]));
  const comment = [...(report.comments?.themes ?? [])].sort((a, b) => b.count - a.count).slice(0, 3).map((t) => t.label);
  const comps = [...(report.summary?.growthAreas ?? []), ...(report.summary?.strengths ?? [])].map((k) => names.get(k) ?? k);
  return [...new Set([...comment, ...comps])];
}

/** Build a groupable session from an assessment row and its latest report (if any). */
export function toGroupableSession(
  r: {
    id: string;
    rootAssessmentId: string | null;
    title: string;
    sessionNumber: number;
    type: "FULL_360" | "PULSE";
    status: string;
    sessionLabel: string | null;
    company: string | null;
    tags: string[];
    closedAt: Date | null;
    launchedAt: Date | null;
    createdAt: Date;
    scaleMax: number;
    reports?: { data: unknown }[];
  },
  surveyTitle: string,
): GroupableSession {
  const data = r.reports?.[0]?.data as ReportData | undefined;
  const visible = !!data?.anonymity?.available;
  return {
    id: r.id,
    rootId: r.rootAssessmentId ?? r.id,
    surveyTitle,
    sessionNumber: r.sessionNumber,
    type: r.type,
    status: r.status,
    label: r.sessionLabel,
    company: r.company,
    tags: r.tags,
    date: (r.closedAt ?? r.launchedAt ?? r.createdAt).toISOString(),
    score: visible ? (data!.summary.overallOthers ?? null) : null,
    scaleMax: r.scaleMax,
    themes: visible ? reportThemes(data!) : [],
  };
}
