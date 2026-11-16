/**
 * Turn a spreadsheet (rows of cells) into a draft custom questionnaire. Pure and isomorphic.
 *
 * Supported layouts, detected automatically:
 * - template: a header row with a section column and a statement column (optional "self" wording and
 *   section description columns). Blank section cells continue the section above.
 * - form export: a Google Forms / Microsoft Forms responses sheet, where each column header is a question
 *   (timestamp, email, name and ID columns are skipped). Grid questions "Question [item]" become a
 *   section "Question" with the item as the statement.
 * - two columns without headers: section, statement.
 * - one column: a list of statements, placed in sections of up to 8.
 *
 * Imported answers are never read: only questions are used.
 */
import { toFirstPerson } from "@/lib/questionnaire";

export type ImportLayout = "template" | "form_export" | "two_columns" | "list";
export type DraftQuestion = { text: string; selfText: string; selfEdited?: boolean };
export type DraftSection = { name: string; description: string; questions: DraftQuestion[] };
export type DraftQuestionnaire = { name: string; description: string; competencies: DraftSection[] };
export type ImportResult =
  | { ok: true; draft: DraftQuestionnaire; layout: ImportLayout; warnings: string[]; statements: number }
  | { ok: false; error: string };

export const LIMITS = { sections: 10, perSection: 8, total: 60, minTotal: 5 };

const SECTION_HEAD = /^(section|competenc(y|ies)|category|area|theme|dimension|topic|group|pillar)s?\b/i;
const STATEMENT_HEAD = /^(statement|question|item|behaviou?r|text|prompt)s?\b/i;
const SELF_HEAD = /\bself\b|\bfirst[- ]person\b|\bme\b/i;
const DESC_HEAD = /^(section )?description\b/i;
const META_HEAD =
  /^(timestamp|time ?stamp|id|respondent|start time|completion time|end time|submitted( at)?|last modified( time)?|email( address)?|e-mail|name|full name|score|total score|points|ip address|language)$/i;

const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** "1. Communicates clearly" / "Q3: …" / "a) …" → the statement text. */
export function stripNumbering(s: string) {
  return s.replace(/^\s*(q(uestion)?\s*)?(\d+|[a-z])[.):\]-]\s+/i, "").trim();
}

const THIRD_PERSON = /^([A-Z][a-z'-]+s)\b(.*)$/;
const NOT_VERBS = new Set(["this", "his", "has", "is", "was", "does", "always", "sometimes", "perhaps", "its", "yes", "us", "thus", "news", "status"]);

/**
 * Rater wording: keep {name} if present; "Communicates clearly" → "{name} communicates clearly";
 * otherwise keep the text (flagged for review by the caller).
 */
export function toRaterStatement(raw: string): { text: string; converted: boolean } {
  const t = stripNumbering(clean(raw)).replace(/\s*\*$/, "");
  if (t.includes("{name}")) return { text: t, converted: true };
  if (t.endsWith("?")) return { text: t, converted: false };
  const m = t.match(THIRD_PERSON);
  if (m && !NOT_VERBS.has(m[1].toLowerCase())) return { text: `{name} ${m[1].toLowerCase()}${m[2]}`, converted: true };
  if (/^(he|she|they|the person|this person|my colleague|my manager)\s/i.test(t)) return { text: t.replace(/^(he|she|they|the person|this person|my colleague|my manager)\s/i, "{name} "), converted: true };
  return { text: t, converted: false };
}

function findCol(header: string[], re: RegExp, exclude: number[] = []) {
  return header.findIndex((h, i) => !exclude.includes(i) && re.test(h));
}

function titleFromFile(fileName: string) {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/\s*\((responses?|answers?)\)\s*$/i, "").trim();
  const name = base.length >= 3 ? base : "Imported questionnaire";
  return name.slice(0, 80);
}

type Pair = { section: string; text: string; self?: string; description?: string };

function detect(rows: string[][]): { layout: ImportLayout; pairs: Pair[] } {
  const header = rows[0] ?? [];
  const width = Math.max(0, ...rows.map((r) => r.length));
  const secCol = findCol(header, SECTION_HEAD);
  const stmtCol = findCol(header, STATEMENT_HEAD, [secCol]);
  if (stmtCol >= 0) {
    const selfCol = findCol(header, SELF_HEAD, [secCol, stmtCol]);
    const descCol = findCol(header, DESC_HEAD, [secCol, stmtCol, selfCol]);
    const pairs: Pair[] = [];
    let section = "";
    for (const r of rows.slice(1)) {
      if (secCol >= 0 && r[secCol]) section = r[secCol];
      if (!r[stmtCol]) continue;
      pairs.push({ section: section || "General", text: r[stmtCol], self: selfCol >= 0 ? r[selfCol] : undefined, description: descCol >= 0 ? r[descCol] : undefined });
    }
    return { layout: "template", pairs };
  }
  const metaCount = header.filter((h) => META_HEAD.test(h)).length;
  const questionLike = header.filter((h) => h && !META_HEAD.test(h) && (h.length > 25 || /\?$/.test(h) || /\[.+\]$/.test(h))).length;
  if (metaCount > 0 || (width >= 3 && questionLike >= 3)) {
    const pairs: Pair[] = [];
    for (const h of header) {
      if (!h || META_HEAD.test(h)) continue;
      const grid = h.match(/^(.*?)\s*\[(.+)\]$/);
      if (grid) pairs.push({ section: grid[1] || "General", text: grid[2] });
      else pairs.push({ section: "General", text: h });
    }
    return { layout: "form_export", pairs };
  }
  if (width >= 2) {
    const pairs: Pair[] = [];
    let section = "";
    for (const r of rows) {
      if (r[0]) section = r[0];
      if (r[1]) pairs.push({ section: section || "General", text: r[1] });
    }
    return { layout: "two_columns", pairs };
  }
  return { layout: "list", pairs: rows.map((r) => r[0]).filter(Boolean).map((text) => ({ section: "General", text })) };
}

export function importQuestionnaire(rawRows: unknown[][], fileName = "Imported questionnaire"): ImportResult {
  const rows = rawRows.map((r) => (r ?? []).map(clean)).filter((r) => r.some(Boolean));
  if (!rows.length) return { ok: false, error: "The file is empty." };
  const { layout, pairs } = detect(rows);
  const warnings: string[] = [];

  // Build sections in order of first appearance; drop too-short and duplicate statements.
  const sections = new Map<string, DraftSection>();
  const seen = new Set<string>();
  let dropped = 0;
  let questions = 0;
  let unconverted = 0;
  for (const p of pairs) {
    const { text, converted } = toRaterStatement(p.text);
    if (text.length < 5 || seen.has(text.toLowerCase())) {
      dropped++;
      continue;
    }
    seen.add(text.toLowerCase());
    if (text.endsWith("?")) questions++;
    else if (!converted) unconverted++;
    const name = clean(p.section).slice(0, 60) || "General";
    const key = name.toLowerCase();
    const sec = sections.get(key) ?? { name: name.length >= 2 ? name : `Section ${name}`, description: "", questions: [] };
    if (p.description && !sec.description) sec.description = clean(p.description).slice(0, 200);
    const self = p.self && clean(p.self).length >= 5 ? clean(p.self).slice(0, 300) : toFirstPerson(text);
    sec.questions.push({ text: text.slice(0, 300), selfText: self.slice(0, 300), selfEdited: !!p.self });
    sections.set(key, sec);
  }

  // Split long sections into parts of 8.
  let competencies: DraftSection[] = [];
  for (const s of sections.values()) {
    if (s.questions.length <= LIMITS.perSection) competencies.push(s);
    else {
      const parts = Math.ceil(s.questions.length / LIMITS.perSection);
      for (let i = 0; i < parts; i++)
        competencies.push({ ...s, name: `${s.name.slice(0, 54)} (${i + 1})`, questions: s.questions.slice(i * LIMITS.perSection, (i + 1) * LIMITS.perSection) });
      warnings.push(`"${s.name}" had ${s.questions.length} statements, so it was split into ${parts} sections of up to ${LIMITS.perSection}.`);
    }
  }
  if (competencies.length > LIMITS.sections) {
    warnings.push(`Only the first ${LIMITS.sections} sections were kept (the file had ${competencies.length}).`);
    competencies = competencies.slice(0, LIMITS.sections);
  }
  let total = competencies.reduce((n, c) => n + c.questions.length, 0);
  if (total > LIMITS.total) {
    let left = LIMITS.total;
    competencies = competencies
      .map((c) => {
        const q = c.questions.slice(0, Math.max(0, left));
        left -= q.length;
        return { ...c, questions: q };
      })
      .filter((c) => c.questions.length);
    warnings.push(`Only the first ${LIMITS.total} statements were kept (the file had ${total}).`);
    total = LIMITS.total;
  }
  if (total < LIMITS.minTotal) return { ok: false, error: `Found ${total} usable statement${total === 1 ? "" : "s"}; a questionnaire needs at least ${LIMITS.minTotal}. Check the file has one statement per row (or per column for form exports).` };

  if (layout === "form_export") warnings.push("Read as a form export: question headers were imported and all answers were ignored.");
  if (dropped) warnings.push(`${dropped} duplicate or too-short line${dropped === 1 ? " was" : "s were"} skipped.`);
  if (questions) warnings.push(`${questions} item${questions === 1 ? " is a question" : "s are questions"}. Raters score how often a behaviour happens, so rewrite these as statements (e.g. "{name} explains decisions clearly").`);
  if (unconverted) warnings.push(`${unconverted} statement${unconverted === 1 ? "" : "s"} don't mention the person. Add {name} where it fits and check the self-assessment wording.`);

  return { ok: true, draft: { name: titleFromFile(fileName), description: "", competencies }, layout, warnings, statements: total };
}
