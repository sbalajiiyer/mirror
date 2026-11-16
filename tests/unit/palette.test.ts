import { describe, expect, it } from "vitest";
import { contrastRatio, heatColor, heatInk } from "@/components/report/palette";

describe("heatmap palette", () => {
  it("every heat cell's text meets WCAG AA contrast (4.5:1)", () => {
    for (const max of [5, 7, 10]) {
      for (let s = 1; s <= max; s += 0.05) expect(contrastRatio(heatColor(s, max), heatInk(s, max))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
