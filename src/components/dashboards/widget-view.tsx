import type { WidgetData } from "@/lib/dashboards/widgets";

const fmt = (c: string | number | null) => (c == null ? "–" : typeof c === "number" ? (Number.isInteger(c) ? String(c) : c.toFixed(2)) : c);

/** A widget as a table, with an inline bar for its main numeric column. Server-rendered and accessible. */
export function WidgetTable({ d }: { d: WidgetData }) {
  if (d.locked) return <p className="text-sm text-muted-foreground">{d.locked}</p>;
  if (!d.rows.length) return <p className="text-sm text-muted-foreground">Nothing to show yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{d.title}</caption>
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            {d.columns.map((c, i) => (
              <th key={i} className={`font-normal ${i ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => (
                <td key={j} className={`py-1 ${j ? "text-right tabular-nums" : ""}`}>
                  {d.bar === j && typeof c === "number" && d.max ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="hidden h-1.5 w-20 rounded bg-muted sm:inline-block" aria-hidden>
                        <span className="block h-full rounded bg-primary" style={{ width: `${Math.max(0, Math.min(100, (c / d.max) * 100))}%` }} />
                      </span>
                      {fmt(c)}
                    </span>
                  ) : (
                    fmt(c)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
