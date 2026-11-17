import { formatCredits } from "@/lib/billing/pricing";
import { LEDGER_REASON } from "@/lib/services/credits";

type Row = {
  id: string;
  createdAt: Date;
  delta: number;
  reason: string;
  balanceAfter: number | null;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Credit history: what was added and spent, with the balance after each entry. */
export function LedgerTable({
  rows,
  testId = "credit-ledger",
}: {
  rows: Row[];
  testId?: string;
}) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">No credit activity yet.</p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid={testId}>
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">What</th>
            <th className="py-2 pr-3 text-right font-medium">Credits</th>
            <th className="py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-2 pr-3">{day(r.createdAt)}</td>
              <td className="py-2 pr-3">
                {LEDGER_REASON[r.reason] ?? r.reason}
              </td>
              <td
                className={`py-2 pr-3 text-right tabular-nums ${r.delta < 0 ? "" : "text-emerald-700 dark:text-emerald-400"}`}
              >
                {r.delta > 0 ? "+" : "−"}
                {formatCredits(Math.abs(r.delta))}
              </td>
              <td className="py-2 text-right tabular-nums">
                {r.balanceAfter == null ? "" : formatCredits(r.balanceAfter)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
