"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ReportData } from "@/lib/report/compute";
import { Legend } from "./legend";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { OTHERS_COLOR, SELF_COLOR, fmt, groupColor } from "./palette";

export function CompetencyRadar({ report, visibleGroups, print }: { report: ReportData; visibleGroups: string[]; print?: boolean }) {
  const groups = report.anonymity.groups;
  const data = report.competencies.map((c) => {
    const row: Record<string, string | number | null> = { name: c.name, self: c.self, others: c.others.mean };
    for (const g of groups) row[g.id] = c.byGroup[g.id]?.mean ?? null;
    return row;
  });
  const shown = groups.map((g, i) => ({ ...g, color: groupColor(i) })).filter((g) => visibleGroups.includes(g.id));
  const max = report.assessment.scaleMax;
  const reduceMotion = useReducedMotion();

  return (
    <div className="space-y-3">
      <div className="h-[340px] w-full sm:h-[400px]" role="img" aria-label={`Radar chart comparing your self-rating with others' ratings. ${report.competencies.map((c) => `${c.name}: you ${fmt(c.self)}, others ${fmt(c.others.mean)}`).join("; ")}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%" margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <PolarRadiusAxis domain={[1, max]} tickCount={max} angle={90} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} />
            <Radar name="All others" dataKey="others" stroke={OTHERS_COLOR} fill={OTHERS_COLOR} fillOpacity={0.15} strokeWidth={2} isAnimationActive={!print && !reduceMotion} dot={{ r: 3 }} />
            {shown.map((g) => (
              <Radar key={g.id} name={g.label} dataKey={g.id} stroke={g.color} fill="none" strokeWidth={2} isAnimationActive={!print && !reduceMotion} dot={{ r: 2.5 }} connectNulls />
            ))}
            <Radar name="Self" dataKey="self" stroke={SELF_COLOR} fill="none" strokeWidth={2} strokeDasharray="5 3" isAnimationActive={!print && !reduceMotion} dot={{ r: 3 }} />
            {!print && (
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => fmt(typeof v === "number" ? v : null)}
              />
            )}
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: "Self", color: SELF_COLOR, dashed: true },
          { label: "All others", color: OTHERS_COLOR },
          ...shown.map((g) => ({ label: g.label, color: g.color })),
        ]}
      />
    </div>
  );
}
