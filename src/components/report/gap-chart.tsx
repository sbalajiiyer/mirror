"use client";

import { scaleLinear } from "d3";
import type { ReportData } from "@/lib/report/compute";
import { GAP_THRESHOLD } from "@/lib/report/constants";
import { TooltipBox, useTooltip } from "./tooltip";
import { fmt } from "./palette";

/**
 * Diverging bars: self − others per competency. Right (red) = you rate yourself higher
 * than others do (potential blind spot); left (blue) = others rate you higher (hidden strength).
 */
export function GapChart({ report, onSelect }: { report: ReportData; onSelect?: (key: string) => void }) {
  const rows = report.competencies.filter((c) => c.gap !== null).sort((a, b) => b.gap! - a.gap!);
  const { tip, bind } = useTooltip<(typeof rows)[number]>();
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.gap!)));
  const W = 640;
  const labelW = 170;
  const rowH = 34;
  const H = rows.length * rowH + 30;
  const x = scaleLinear().domain([-maxAbs, maxAbs]).range([labelW, W - 40]).nice();
  const zero = x(0);
  return (
    <div className="relative" data-tip-host>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="group" aria-label="Self versus others gap by competency. Positive means you rate yourself higher than others do.">
        {x.ticks(5).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={H - 22} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : "2 3"} />
            <text x={x(t)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
              {t > 0 ? `+${t}` : t}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = i * rowH + 6;
          const g = r.gap!;
          const big = Math.abs(g) >= GAP_THRESHOLD;
          const color = g > 0 ? "var(--chart-neg)" : "var(--chart-pos)";
          const x0 = Math.min(zero, x(g));
          const w = Math.max(2, Math.abs(x(g) - zero));
          return (
            <g
              key={r.key}
              {...bind(r)}
              tabIndex={0}
              role="button"
              className="group cursor-pointer outline-none"
              onClick={() => onSelect?.(r.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(r.key);
                }
              }}
            >
              <rect x={1} y={y - 4} width={W - 2} height={rowH} rx={6} fill="transparent" className="stroke-transparent group-focus-visible:stroke-[var(--ring)]" strokeWidth={2} />
              <text x={labelW - 10} y={y + 15} textAnchor="end" fontSize={12} fill="var(--foreground)">
                {r.name}
              </text>
              <rect x={x0} y={y + 4} width={w} height={rowH - 16} rx={4} fill={color} opacity={big ? 1 : 0.45} />
              <text x={g >= 0 ? x(g) + 6 : x(g) - 6} y={y + 15} textAnchor={g >= 0 ? "start" : "end"} fontSize={11} fill="var(--muted-foreground)">
                {g > 0 ? "+" : ""}
                {g.toFixed(1)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "var(--chart-pos)" }} />
          Others rate you higher — hidden strength
        </span>
        <span>
          <span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: "var(--chart-neg)" }} />
          You rate yourself higher — possible blind spot
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Faded bars: gap under {GAP_THRESHOLD} — broadly aligned.</p>
      {tip && (
        <TooltipBox x={tip.x} y={tip.y}>
          <div className="font-medium">{tip.data.name}</div>
          <div>Self {fmt(tip.data.self)} · Others {fmt(tip.data.others.mean)}</div>
          <div>Gap {tip.data.gap! > 0 ? "+" : ""}{tip.data.gap!.toFixed(2)}</div>
        </TooltipBox>
      )}
    </div>
  );
}
