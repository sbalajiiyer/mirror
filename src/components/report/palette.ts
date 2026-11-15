/** Series colours (CSS vars, see globals.css). Colour follows the entity, never its rank. */
export const SELF_COLOR = "var(--chart-self)";
export const OTHERS_COLOR = "var(--chart-others)";
const GROUP_SLOTS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** Group colour by its position in the report's (stable) group list. */
export function groupColor(index: number) {
  return GROUP_SLOTS[index % GROUP_SLOTS.length];
}

/** Sequential blue ramp (light→dark) for heatmap cells, score 1..max. */
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
export function heatColor(score: number, max: number) {
  const t = Math.max(0, Math.min(1, (score - 1) / (max - 1)));
  return RAMP[Math.round(t * (RAMP.length - 1))];
}
/** Text ink that stays readable on a heat cell. */
export function heatInk(score: number, max: number) {
  return (score - 1) / (max - 1) > 0.55 ? "#ffffff" : "#0b0b0b";
}

export const fmt = (x: number | null | undefined) => (x == null ? "–" : x.toFixed(1));
