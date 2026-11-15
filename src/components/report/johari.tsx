import type { Quadrant, ReportData } from "@/lib/report/compute";
import { QUADRANTS } from "@/lib/report/constants";
import { fmt } from "./palette";

const ORDER: Quadrant[] = ["open_strength", "blind_spot", "hidden_strength", "development_area"];

/** Johari window: quadrants split at the person's own average self and others scores. */
export function JohariWindow({ report, onSelect }: { report: ReportData; onSelect?: (key: string) => void }) {
  const byQ = (q: Quadrant) => report.competencies.filter((c) => c.quadrant === q);
  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_1fr] grid-rows-[auto_1fr_1fr] gap-2 text-sm">
        <div />
        <div className="text-center text-xs font-medium text-muted-foreground">You rate higher</div>
        <div className="text-center text-xs font-medium text-muted-foreground">You rate lower</div>
        {[0, 1].map((row) => (
          <Row key={row} row={row} byQ={byQ} onSelect={onSelect} />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Split at your averages: self {fmt(report.johari.selfThreshold)}, others {fmt(report.johari.othersThreshold)}. Quadrants are relative to you, not to other people.
      </p>
    </div>
  );
}

function Row({ row, byQ, onSelect }: { row: number; byQ: (q: Quadrant) => ReportData["competencies"]; onSelect?: (k: string) => void }) {
  const qs = row === 0 ? (["open_strength", "hidden_strength"] as const) : (["blind_spot", "development_area"] as const);
  return (
    <>
      <div className="flex items-center text-xs font-medium text-muted-foreground [writing-mode:vertical-rl] rotate-180 justify-center">
        {row === 0 ? "Others rate higher" : "Others rate lower"}
      </div>
      {qs.map((q) => {
        const items = byQ(q);
        return (
          <section key={q} aria-label={QUADRANTS[q].label} className="min-h-32 rounded-lg border bg-muted/40 p-3 avoid-break">
            <h4 className="text-sm font-semibold">{QUADRANTS[q].label}</h4>
            <p className="mb-2 text-xs text-muted-foreground">{QUADRANTS[q].hint}</p>
            <ul className="flex flex-wrap gap-1.5">
              {items.map((c) => (
                <li key={c.key}>
                  <button
                    onClick={() => onSelect?.(c.key)}
                    className="rounded-md border bg-card px-2 py-1 text-left text-xs hover:border-primary"
                    title={`Self ${fmt(c.self)} · Others ${fmt(c.others.mean)}`}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-1 text-muted-foreground">
                      {fmt(c.self)} / {fmt(c.others.mean)}
                    </span>
                  </button>
                </li>
              ))}
              {items.length === 0 && <li className="text-xs text-muted-foreground">None</li>}
            </ul>
          </section>
        );
      })}
    </>
  );
}
export { ORDER as JOHARI_ORDER };
