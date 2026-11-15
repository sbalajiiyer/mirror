"use client";

import type { QuestionResult } from "@/lib/report/compute";
import { Badge } from "@/components/ui/badge";
import { fmt } from "./palette";

/** Dot strip per question: one dot per rating, others' mean (blue bar) and self (orange diamond). */
export function QuestionDistribution({ q, scaleMax }: { q: QuestionResult; scaleMax: number }) {
  const W = 300;
  const H = 54;
  const pad = 16;
  const x = (v: number) => pad + ((v - 1) / (scaleMax - 1)) * (W - pad * 2);
  const dots = q.distribution ?? [];
  const agreement = { high: "High agreement", medium: "Some disagreement", low: "Raters disagree" } as const;
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[1fr_300px] sm:items-center" data-testid="distribution-row">
      <div>
        <p className="text-sm">{q.text}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Others {fmt(q.others.mean)} (n={q.others.n}) · Self {fmt(q.self)}
          {q.agreement && (
            <Badge variant={q.agreement === "low" ? "warning" : "outline"} className="ml-2">
              {agreement[q.agreement]}
            </Badge>
          )}
        </p>
      </div>
      {q.others.suppressed ? (
        <p className="text-xs text-muted-foreground">Too few answers to show.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Distribution: ${dots.map((c, i) => `${c} rated ${i + 1}`).join(", ")}`}>
          <line x1={pad} x2={W - pad} y1={H - 14} y2={H - 14} stroke="var(--border)" />
          {Array.from({ length: scaleMax }, (_, i) => (
            <text key={i} x={x(i + 1)} y={H - 2} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">
              {i + 1}
            </text>
          ))}
          {dots.flatMap((count, i) =>
            Array.from({ length: count }, (_, k) => {
              const col = k % 4;
              const row = Math.floor(k / 4);
              return <circle key={`${i}-${k}`} cx={x(i + 1) - 9 + col * 6} cy={H - 20 - row * 6} r={2.5} fill="var(--chart-others)" opacity={0.75} />;
            }),
          )}
          {q.others.mean != null && <rect x={x(q.others.mean) - 1.5} y={4} width={3} height={H - 18} rx={1.5} fill="var(--chart-others)" />}
          {q.self != null && (
            <path d={`M ${x(q.self)} 2 l 5 5 l -5 5 l -5 -5 z`} fill="var(--chart-self)" stroke="var(--card)" strokeWidth={1.5}>
              <title>Self {q.self}</title>
            </path>
          )}
        </svg>
      )}
    </div>
  );
}
