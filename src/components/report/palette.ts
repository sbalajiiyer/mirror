/** Series colours (CSS vars, see globals.css). Colour follows the entity, never its rank. */
export const SELF_COLOR = "var(--chart-self)";
export const OTHERS_COLOR = "var(--chart-others)";
const GROUP_SLOTS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** Group colour by its position in the report's (stable) group list. */
export function groupColor(index: number) {
  return GROUP_SLOTS[index % GROUP_SLOTS.length];
}

/** Sequential blue ramp (light→dark) for heatmap cells, score 1..max. */
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2873d0", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
export function heatColor(score: number, max: number) {
  const t = Math.max(0, Math.min(1, (score - 1) / (max - 1)));
  return RAMP[Math.round(t * (RAMP.length - 1))];
}
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrastRatio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Text ink for a heat cell: whichever of white or near-black has more contrast (WCAG AA needs 4.5:1). */
export function heatInk(score: number, max: number) {
  const bg = heatColor(score, max);
  return contrastRatio(bg, "#ffffff") >= contrastRatio(bg, "#0b0b0b") ? "#ffffff" : "#0b0b0b";
}

export const fmt = (x: number | null | undefined) => (x == null ? "–" : x.toFixed(1));
