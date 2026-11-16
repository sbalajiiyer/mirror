"use client";

import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { OTHERS_COLOR, SELF_COLOR } from "@/components/report/palette";

/** Team vs organization radar (others' averages). */
export function TeamRadar({ data, max, teamName }: { data: { name: string; team: number; org: number | null }[]; max: number; teamName: string }) {
  return (
    <div className="h-80 w-full" role="img" aria-label={`Radar: ${teamName} vs organization. ${data.map((d) => `${d.name}: team ${d.team.toFixed(1)}${d.org != null ? `, org ${d.org.toFixed(1)}` : ""}`).join("; ")}.`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid />
          <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <PolarRadiusAxis domain={[1, max]} tickCount={max} tick={{ fontSize: 10 }} />
          <Radar name={teamName} dataKey="team" stroke={OTHERS_COLOR} fill={OTHERS_COLOR} fillOpacity={0.2} strokeWidth={2} isAnimationActive={false} />
          <Radar name="Organization" dataKey="org" stroke={SELF_COLOR} fill="none" strokeDasharray="5 3" strokeWidth={2} isAnimationActive={false} />
          <Tooltip formatter={(v) => (typeof v === "number" ? v.toFixed(2) : String(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
