import { Eye, EyeOff, TrendingUp, Sprout } from "lucide-react";
import type { ReportData } from "@/lib/report/compute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "./palette";

export function SummaryCard({ report }: { report: ReportData }) {
  const comp = (k: string | null) => report.competencies.find((c) => c.key === k);
  const s = report.summary;
  const blind = comp(s.blindSpot);
  const hidden = comp(s.hiddenStrength);
  return (
    <Card className="avoid-break">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Summary</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground" data-testid="summary-narrative">
          {s.narrative}
        </p>
        <p className="text-[11px] text-muted-foreground">Auto-generated from your scores. AI-written summaries arrive in Phase 3.</p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={<TrendingUp className="size-4 text-emerald-600" />} title="Top strengths">
          <ol className="space-y-1">
            {s.strengths.map((k) => (
              <li key={k} className="flex justify-between gap-2">
                <span>{comp(k)?.name}</span>
                <span className="tabular-nums text-muted-foreground">{fmt(comp(k)?.others.mean)}</span>
              </li>
            ))}
          </ol>
        </Tile>
        <Tile icon={<Sprout className="size-4 text-amber-600" />} title="Growth areas">
          <ol className="space-y-1">
            {s.growthAreas.map((k) => (
              <li key={k} className="flex justify-between gap-2">
                <span>{comp(k)?.name}</span>
                <span className="tabular-nums text-muted-foreground">{fmt(comp(k)?.others.mean)}</span>
              </li>
            ))}
          </ol>
        </Tile>
        <Tile icon={<EyeOff className="size-4 text-red-600" />} title="Biggest blind spot">
          {blind ? (
            <>
              <p className="font-medium">{blind.name}</p>
              <p className="text-xs text-muted-foreground">
                You {fmt(blind.self)} · others {fmt(blind.others.mean)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">None — your self-view matches others&apos;.</p>
          )}
        </Tile>
        <Tile icon={<Eye className="size-4 text-sky-600" />} title="Hidden strength">
          {hidden ? (
            <>
              <p className="font-medium">{hidden.name}</p>
              <p className="text-xs text-muted-foreground">
                You {fmt(hidden.self)} · others {fmt(hidden.others.mean)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">None stood out.</p>
          )}
        </Tile>
      </CardContent>
    </Card>
  );
}

function Tile({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3 text-sm">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
}
