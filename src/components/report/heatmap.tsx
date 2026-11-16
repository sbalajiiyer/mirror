"use client";

import type { Cell, ReportData } from "@/lib/report/compute";
import { cn } from "@/lib/utils";
import { fmt, heatColor, heatInk } from "./palette";

/** Competencies × rater groups. Hidden cells protect anonymity and are hatched. */
export function GroupHeatmap({ report, selected, onSelect }: { report: ReportData; selected?: string | null; onSelect?: (key: string) => void }) {
  const max = report.assessment.scaleMax;
  const groups = report.anonymity.groups;
  const cols: { id: string; label: string; get: (c: ReportData["competencies"][number]) => Cell | { mean: number | null; n: number; suppressed: false } }[] = [
    { id: "self", label: "Self", get: (c) => ({ mean: c.self, n: 1, suppressed: false }) },
    { id: "others", label: "All others", get: (c) => c.others },
    ...groups.map((g) => ({ id: g.id, label: g.label, get: (c: ReportData["competencies"][number]) => c.byGroup[g.id] ?? { mean: null, n: 0, suppressed: false as const } })),
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-[2px] text-sm">
        <caption className="sr-only">Average score per competency for each rater group</caption>
        <thead>
          <tr>
            <th scope="col" className="text-left text-xs font-medium text-muted-foreground">
              Competency
            </th>
            {cols.map((c) => (
              <th key={c.id} scope="col" className="px-1 pb-1 text-center text-xs font-medium text-muted-foreground">
                {c.label}
                {groups.find((g) => g.id === c.id) && <span className="block font-normal">n={groups.find((g) => g.id === c.id)!.n}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.competencies.map((comp) => (
            <tr key={comp.key} className={cn(onSelect && "cursor-pointer", selected === comp.key && "outline outline-2 outline-primary")} onClick={() => onSelect?.(comp.key)}>
              <th scope="row" className="pr-2 text-left font-medium">
                {onSelect ? (
                  <button type="button" className="rounded text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onSelect(comp.key)} aria-pressed={selected === comp.key}>
                    {comp.name}
                  </button>
                ) : (
                  comp.name
                )}
              </th>
              {cols.map((col) => {
                const cell = col.get(comp);
                if (cell.suppressed)
                  return (
                    <td
                      key={col.id}
                      title="Hidden to protect anonymity (too few answers)"
                      className="h-10 rounded text-center text-xs text-muted-foreground"
                      style={{ background: "repeating-linear-gradient(45deg, var(--muted), var(--muted) 4px, transparent 4px, transparent 8px)" }}
                    >
                      <span className="sr-only">hidden</span>–
                    </td>
                  );
                if (cell.mean == null)
                  return (
                    <td key={col.id} className="h-10 rounded bg-muted text-center text-xs text-muted-foreground">
                      –
                    </td>
                  );
                return (
                  <td
                    key={col.id}
                    className="h-10 rounded text-center font-medium tabular-nums"
                    style={{ background: heatColor(cell.mean, max), color: heatInk(cell.mean, max) }}
                    title={`${comp.name} · ${col.label}: ${fmt(cell.mean)}`}
                  >
                    {fmt(cell.mean)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
        <span>1</span>
        <span className="h-2 w-40 rounded" style={{ background: `linear-gradient(90deg, ${[1, 2, 3, 4, 5].map((v) => heatColor(1 + ((v - 1) * (max - 1)) / 4, max)).join(",")})` }} />
        <span>{max}</span>
        <span
          className="ml-4 inline-block h-3 w-5 rounded-sm"
          style={{ background: "repeating-linear-gradient(45deg, var(--muted-foreground), var(--muted-foreground) 2px, transparent 2px, transparent 5px)" }}
        />
        <span>hidden for anonymity</span>
      </div>
    </div>
  );
}
