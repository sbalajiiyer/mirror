import type { Participation } from "@/lib/org/analytics";
import { Progress } from "@/components/ui/progress";

/** Funnel for one 360 round: invited → started → self-assessed → raters invited → closed, plus rater response rate. */
export function ParticipationBar({ p, label }: { p: Participation; label: string }) {
  const steps = [
    ["Taking part", p.invited],
    ["Started", p.started],
    ["Rated themselves", p.selfDone],
    ["Collecting / done", p.launched],
    ["Closed", p.closed],
  ] as const;
  const rate = p.raterInvites ? Math.round((p.raterResponses / p.raterInvites) * 100) : 0;
  return (
    <div className="space-y-2" data-testid="participation">
      <dl className="grid grid-cols-5 gap-2 text-center text-xs">
        {steps.map(([k, v]) => (
          <div key={k} className="rounded-md border p-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-lg font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Progress value={rate} className="h-1.5 w-40" aria-label={`${label} rater response rate`} />
        {p.raterResponses}/{p.raterInvites} rater responses ({rate}%)
      </div>
    </div>
  );
}
