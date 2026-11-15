/**
 * Server-side anonymity rules. Every number that leaves the server in a report goes
 * through these functions; the UI never receives raw per-rater data.
 *
 * Rules
 * 1. Minimum raters: a rater group's results are shown only when at least `min`
 *    people in it responded (min is never below ANONYMITY_FLOOR = 3).
 * 2. Small groups are pooled. Groups under the minimum are combined; if the pool still
 *    falls short it is merged into the smallest visible group. This prevents the
 *    "subtraction attack" (all-others minus visible groups = hidden group).
 * 3. Manager exception: the manager group is shown on its own (even with 1 rater) ONLY if
 *    the subject opted in, and the manager was told so on the rater form.
 * 4. Cell suppression: within any question or competency, a cell with fewer than `min`
 *    answers is hidden, with complementary suppression so hidden cells can't be derived
 *    from the totals.
 * 5. Nothing identifying is ever returned: no rater names/emails, no timestamps, no
 *    per-submission ids; comments are shuffled deterministically.
 */
import type { RaterGroupKind } from "@prisma/client";

export const ANONYMITY_FLOOR = 3;

export function effectiveMinRaters(configured: number | null | undefined): number {
  return Math.max(ANONYMITY_FLOOR, Math.floor(configured ?? ANONYMITY_FLOOR));
}

export type GroupInput = { id: string; kind: RaterGroupKind; name: string; order: number };

export type ReportingGroup = {
  /** Stable synthetic id, e.g. "rg_peer" or "rg_combined". */
  id: string;
  label: string;
  kinds: RaterGroupKind[];
  memberGroupIds: string[];
  n: number;
  /** True only for an opted-in manager group: shown regardless of the threshold. */
  exempt: boolean;
};

export type GroupResolution = {
  min: number;
  othersN: number;
  /** Whether any "others" results may be shown at all. */
  othersVisible: boolean;
  reportingGroups: ReportingGroup[];
  /** Maps a real RaterGroup id → reporting group id (null = not reportable). */
  groupToReporting: Record<string, string | null>;
  notes: string[];
};

/**
 * Decide which rater groups can be shown, and how small groups are pooled.
 * `counts` = number of submitted (non-self) questionnaires per RaterGroup id.
 */
export function resolveReportingGroups(params: {
  groups: GroupInput[];
  counts: Record<string, number>;
  minRaters: number;
  showManagerSeparately: boolean;
}): GroupResolution {
  const min = effectiveMinRaters(params.minRaters);
  const others = params.groups
    .filter((g) => g.kind !== "SELF")
    .sort((a, b) => a.order - b.order);
  const n = (g: GroupInput) => params.counts[g.id] ?? 0;
  const othersN = others.reduce((s, g) => s + n(g), 0);

  const groupToReporting: Record<string, string | null> = {};
  for (const g of params.groups) groupToReporting[g.id] = null;
  const notes: string[] = [];
  const reporting: ReportingGroup[] = [];

  const exemptGroups = params.showManagerSeparately ? others.filter((g) => g.kind === "MANAGER" && n(g) > 0) : [];
  const pooled = others.filter((g) => !exemptGroups.includes(g));

  // Opted-in manager(s): shown on their own.
  if (exemptGroups.length) {
    reporting.push({
      id: "rg_manager",
      label: exemptGroups.length === 1 ? exemptGroups[0].name : "Managers",
      kinds: ["MANAGER"],
      memberGroupIds: exemptGroups.map((g) => g.id),
      n: exemptGroups.reduce((s, g) => s + n(g), 0),
      exempt: true,
    });
  }

  // Report is only available once the non-exempt raters alone could stay anonymous.
  // (Otherwise "all others" minus the manager would expose the few remaining raters.)
  const pooledN = pooled.reduce((s, g) => s + n(g), 0);
  const othersVisible = othersN >= min && (pooledN === 0 || pooledN >= min);
  if (!othersVisible) {
    notes.push(
      `Results appear once at least ${min} people have responded${exemptGroups.length ? " (not counting your manager)" : ""}.`,
    );
    return { min, othersN, othersVisible, reportingGroups: [], groupToReporting, notes };
  }

  const visible = pooled.filter((g) => n(g) >= min);
  const small = pooled.filter((g) => n(g) > 0 && n(g) < min);

  for (const g of visible) {
    reporting.push({ id: `rg_${g.id}`, label: g.name, kinds: [g.kind], memberGroupIds: [g.id], n: n(g), exempt: false });
  }

  if (small.length) {
    const smallN = small.reduce((s, g) => s + n(g), 0);
    if (smallN >= min) {
      reporting.push({
        id: "rg_combined",
        label: `Combined: ${small.map((g) => g.name).join(" + ")}`,
        kinds: small.map((g) => g.kind),
        memberGroupIds: small.map((g) => g.id),
        n: smallN,
        exempt: false,
      });
      notes.push(`${small.map((g) => g.name).join(", ")} had fewer than ${min} responses each, so they are combined.`);
    } else {
      // Merge into the smallest visible, non-exempt reporting group.
      const target = reporting
        .filter((r) => !r.exempt)
        .sort((a, b) => a.n - b.n)[0];
      // othersVisible guarantees pooledN >= min, so a visible target always exists here.
      target.label = [target.label, ...small.map((g) => g.name)].join(" + ");
      target.kinds = [...target.kinds, ...small.map((g) => g.kind)];
      target.memberGroupIds = [...target.memberGroupIds, ...small.map((g) => g.id)];
      target.n += smallN;
      notes.push(
        `${small.map((g) => g.name).join(", ")} had too few responses to show separately and are merged with ${target.label.split(" + ")[0]}.`,
      );
    }
  }

  for (const r of reporting) for (const gid of r.memberGroupIds) groupToReporting[gid] = r.id;
  return { min, othersN, othersVisible, reportingGroups: reporting, groupToReporting, notes };
}

export type CellInput = { key: string; n: number; exempt?: boolean };

/**
 * Decide which cells in one row (e.g. one question across reporting groups) must be hidden.
 * A cell is hidden when 0 < n < min. If the hidden cells together still hold fewer than
 * `min` answers, more cells are hidden (smallest first) so their combined value can't be
 * derived as total − visible cells. Exempt cells (opted-in manager) are never hidden.
 */
export function suppressCells(cells: CellInput[], min: number): Set<string> {
  const m = effectiveMinRaters(min);
  const hidden = new Set<string>();
  for (const c of cells) if (!c.exempt && c.n > 0 && c.n < m) hidden.add(c.key);
  const hiddenN = () => cells.filter((c) => hidden.has(c.key)).reduce((s, c) => s + c.n, 0);
  while (hiddenN() > 0 && hiddenN() < m) {
    const next = cells
      .filter((c) => !c.exempt && !hidden.has(c.key) && c.n > 0)
      .sort((a, b) => a.n - b.n || a.key.localeCompare(b.key))[0];
    if (!next) break;
    hidden.add(next.key);
  }
  return hidden;
}

/** Deterministic shuffle so comment order never reflects submission order. */
export function stableShuffle<T>(items: T[], keyOf: (t: T) => string): T[] {
  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  return [...items].sort((a, b) => hash(keyOf(a)) - hash(keyOf(b)));
}
