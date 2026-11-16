import type { BenchmarkRow } from "@/lib/services/benchmarks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Where each competency sits against anonymous norms: a band from p25 to p75 with the median and your score. */
export function BenchmarkCard({ rows, people }: { rows: BenchmarkRow[]; people: number | null }) {
  const pos = (v: number) => `${((v - 1) / 4) * 100}%`;
  return (
    <Card className="no-print" data-testid="benchmarks">
      <CardHeader>
        <CardTitle>Benchmarks</CardTitle>
        <CardDescription>
          Others&apos; average for you against {rows[0]?.norm.label === "Everyone" ? `${people ?? rows[0]?.norm.n} people on Mirror` : `people at your career stage (${rows[0]?.norm.label}, ${rows[0]?.norm.n})`}. The bar
          spans the middle half; the line is the median, the dot is you. Anonymous norms, percentiles only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <caption className="sr-only">Benchmarks per competency</caption>
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-44 font-normal">Competency</th>
              <th className="font-normal">You vs others</th>
              <th className="w-36 text-right font-normal">Where you sit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="py-2">{r.name}</td>
                <td>
                  <div className="relative h-3 rounded bg-muted" role="img" aria-label={`${r.name}: you ${r.you.toFixed(1)}, median ${r.norm.p50.toFixed(1)}, middle half ${r.norm.p25.toFixed(1)} to ${r.norm.p75.toFixed(1)}`}>
                    <div className="absolute inset-y-0 rounded bg-primary/25" style={{ left: pos(r.norm.p25), width: `calc(${pos(r.norm.p75)} - ${pos(r.norm.p25)})` }} />
                    <div className="absolute inset-y-[-2px] w-0.5 bg-foreground/60" style={{ left: pos(r.norm.p50) }} />
                    <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary" style={{ left: pos(r.you) }} />
                  </div>
                </td>
                <td className="text-right text-xs">
                  <span className="font-medium">{r.band}</span> <span className="text-muted-foreground">(~{r.percentile}th)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
