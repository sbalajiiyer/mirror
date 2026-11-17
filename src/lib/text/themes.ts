/**
 * Phase 2 open-text analysis: deterministic keyword grouping, a tiny sentiment lexicon
 * and word frequencies. Phase 3 replaces `groupComments` with an LLM behind the same shape.
 */

export type ThemeDef = { key: string; label: string; keywords: string[] };

export const THEMES: ThemeDef[] = [
  { key: "communication", label: "Communication & clarity", keywords: ["communicat", "clear", "clarity", "explain", "concise", "articulat", "message", "present", "writ", "update", "inform"] },
  { key: "listening", label: "Listening & openness", keywords: ["listen", "interrupt", "hear", "open to", "open-minded", "perspective", "input", "ideas from"] },
  { key: "delegation", label: "Delegation & trust", keywords: ["delegat", "micromanag", "control", "let go", "trust", "autonomy", "hands-on", "hands on", "ownership to"] },
  { key: "feedback", label: "Feedback & coaching", keywords: ["feedback", "coach", "mentor", "develop", "grow", "support", "1:1", "one-on-one", "career"] },
  { key: "strategy", label: "Strategy & vision", keywords: ["strateg", "vision", "big picture", "long-term", "long term", "roadmap", "direction", "priorit", "future"] },
  { key: "execution", label: "Delivery & follow-through", keywords: ["deliver", "deadline", "follow through", "follow-through", "ship", "execut", "reliab", "on time", "commit", "done", "results"] },
  { key: "collaboration", label: "Collaboration & teamwork", keywords: ["collaborat", "team", "together", "cross-functional", "partner", "credit", "help", "relationship"] },
  { key: "composure", label: "Composure & emotions", keywords: ["calm", "composed", "stress", "pressure", "frustrat", "temper", "patient", "patience", "emotion", "react", "defensive"] },
  { key: "meetings", label: "Meetings & time", keywords: ["meeting", "agenda", "time", "late", "schedule", "calendar", "availability", "respond"] },
  { key: "decisions", label: "Decision-making", keywords: ["decision", "decide", "decisive", "indecis", "judgement", "judgment", "trade-off", "tradeoff", "risk"] },
  { key: "learning", label: "Learning & curiosity", keywords: ["learn", "curio", "new things", "challenge", "experiment", "improv", "adapt"] },
];

const POSITIVE = ["great", "excellent", "clear", "helpful", "supportive", "calm", "reliable", "strong", "good", "thoughtful", "generous", "always", "inspir", "trust", "kind", "patient", "appreciate", "love", "best", "impressive", "fair", "consistent", "thank"];
const NEGATIVE = ["not ", "never", "too ", "less", "lack", "struggle", "late", "interrupt", "micromanag", "defensive", "frustrat", "unclear", "confus", "miss", "slow", "hard to", "difficult", "overwhelm", "rush", "stop", "avoid", "dismiss", "inconsistent", "less consistent", "talk over", "talks over", "lag", "short with", "defensive", "overload", "could listen"];

export type Sentiment = "positive" | "neutral" | "negative";

export function sentimentOf(text: string): { score: number; label: Sentiment } {
  const t = ` ${text.toLowerCase()} `;
  const pos = POSITIVE.filter((w) => t.includes(w)).length;
  const neg = NEGATIVE.filter((w) => t.includes(w)).length;
  const score = Math.max(-1, Math.min(1, (pos - neg) / Math.max(1, pos + neg)));
  return { score, label: score > 0.2 ? "positive" : score < -0.2 ? "negative" : "neutral" };
}

/** Theme keys a comment mentions, best match first. Empty → "other". */
export function themesFor(text: string): string[] {
  const t = text.toLowerCase();
  return THEMES.map((th) => ({ key: th.key, hits: th.keywords.filter((k) => t.includes(k)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((x) => x.key);
}

export type ThemedComment = { text: string; group: string; sentiment: Sentiment };
export type ThemeGroup = {
  key: string;
  label: string;
  count: number;
  /** Distinct raters behind this theme (absent on reports frozen before 2026-11-17). */
  raters?: number;
  sentiment: number; // -1..1 average
  comments: ThemedComment[];
};

/** Group comments by their primary theme. Each comment lands in exactly one theme. */
export function groupComments(comments: { text: string; group: string; sid?: string }[]): ThemeGroup[] {
  const buckets = new Map<string, ThemedComment[]>();
  const scores = new Map<string, number[]>();
  const sids = new Map<string, Set<string>>();
  for (const c of comments) {
    const primary = themesFor(c.text)[0] ?? "other";
    const s = sentimentOf(c.text);
    if (!buckets.has(primary)) {
      buckets.set(primary, []);
      scores.set(primary, []);
      sids.set(primary, new Set());
    }
    if (c.sid) sids.get(primary)!.add(c.sid);
    buckets.get(primary)!.push({ text: c.text, group: c.group, sentiment: s.label });
    scores.get(primary)!.push(s.score);
  }
  const label = (k: string) => THEMES.find((t) => t.key === k)?.label ?? "Other";
  return [...buckets.entries()]
    .map(([key, cs]) => {
      const sc = scores.get(key)!;
      const raters = sids.get(key)!.size;
      return { key, label: label(key), count: cs.length, ...(raters ? { raters } : {}), sentiment: sc.reduce((a, b) => a + b, 0) / sc.length, comments: cs };
    })
    .sort((a, b) => (a.key === "other" ? 1 : b.key === "other" ? -1 : b.count - a.count));
}

const STOPWORDS = new Set(
  "a an and are as at be been but by can could do does for from get gets had has have he her him his how i if in into is it its just like make makes me more most much my need needs not of on one or our out over really she should so some than that the their them then there they this to too up us very was we were what when where which while who will with would you your about also always often sometimes them themselves team work start stop continue people things thing before own behind back else every even sure way well".split(" "),
);

/** Word frequencies for a word cloud (excludes stopwords and the subject's name). */
export function wordFrequencies(texts: string[], exclude: string[] = [], limit = 40): { word: string; count: number }[] {
  const ex = new Set(exclude.map((e) => e.toLowerCase()));
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const raw of text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
      const w = raw.replace(/'s$/, "");
      if (STOPWORDS.has(w) || ex.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .filter((x) => x.count > 1)
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}
