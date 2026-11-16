import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { crossClientAnalytics, getCoachProfile } from "@/lib/services/coach";
import { MIN_CLIENTS } from "@/lib/coach/brief";
import { CoachNav } from "@/components/coach/coach-nav";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Coach analytics" };

export default async function CoachAnalytics() {
  const user = await requireOnboardedUser("/coach/analytics");
  const profile = await getCoachProfile(user.id);
  if (!profile) redirect("/coach");
  const a = await crossClientAnalytics(user.id);
  const max = Math.max(5, ...a.distribution.map((d) => d.max));
  return (
    <div className="space-y-6">
      <CoachNav active="analytics" brand={{ name: profile.brandName, color: profile.brandColor }} />
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="size-4" aria-hidden /> Based on the latest full 360 of {a.clients} client{a.clients === 1 ? "" : "s"} who share reports with you. Figures appear only
        when at least {MIN_CLIENTS} clients contribute, so no single client stands out.
      </p>
      {!a.available ? (
        <Alert tone="info" data-testid="analytics-locked">
          Cross-client patterns unlock once {MIN_CLIENTS} clients share a completed report ({a.clients} so far).
        </Alert>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <Card data-testid="common-blind-spots">
              <CardHeader>
                <CardTitle className="text-base">Common blind spots</CardTitle>
                <CardDescription>Where clients rate themselves higher than others do.</CardDescription>
              </CardHeader>
              <CardContent>
                <CountList items={a.blindSpots} total={a.clients} empty="No blind spots stand out." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Most common growth areas</CardTitle>
                <CardDescription>The lowest-rated areas in each client&apos;s latest report.</CardDescription>
              </CardHeader>
              <CardContent>
                <CountList items={a.growthAreas} total={a.clients} empty="–" />
              </CardContent>
            </Card>
          </div>
          <Card data-testid="competency-distribution">
            <CardHeader>
              <CardTitle className="text-base">Competency distribution</CardTitle>
              <CardDescription>Others&apos; average across clients: the bar spans lowest to highest client, the mark is the mean.</CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <caption className="sr-only">Competency averages across clients</caption>
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-44 font-normal">Competency</th>
                    <th className="font-normal">Range</th>
                    <th className="w-16 text-right font-normal">Mean</th>
                  </tr>
                </thead>
                <tbody>
                  {a.distribution.map((d) => (
                    <tr key={d.key} className="border-t">
                      <td className="py-2">{d.name}</td>
                      <td>
                        <div className="relative h-3 rounded bg-muted" aria-label={`${d.name}: from ${d.min.toFixed(1)} to ${d.max.toFixed(1)}, mean ${d.mean.toFixed(1)}`} role="img">
                          <div className="absolute inset-y-0 rounded bg-primary/30" style={{ left: `${(d.min / max) * 100}%`, width: `${((d.max - d.min) / max) * 100}%` }} />
                          <div className="absolute inset-y-[-2px] w-1 rounded bg-primary" style={{ left: `calc(${(d.mean / max) * 100}% - 2px)` }} />
                        </div>
                      </td>
                      <td className="text-right tabular-nums">{d.mean.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card data-testid="improvement">
            <CardHeader>
              <CardTitle className="text-base">Improvement over time</CardTitle>
              <CardDescription>Average change from each client&apos;s first to latest full 360.</CardDescription>
            </CardHeader>
            <CardContent>
              {!a.improvementAvailable ? (
                <p className="text-sm text-muted-foreground">Appears when at least {MIN_CLIENTS} clients have run two full 360s.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {a.improvement.map((d) => (
                    <li key={d.key} className="flex justify-between border-b py-1 last:border-0">
                      <span>{d.name}</span>
                      <span className={`tabular-nums ${d.meanDelta > 0 ? "text-emerald-700 dark:text-emerald-400" : d.meanDelta < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
                        {d.meanDelta > 0 ? "+" : ""}
                        {d.meanDelta.toFixed(2)} <span className="text-xs text-muted-foreground">({d.clients} clients)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function CountList({ items, total, empty }: { items: { key: string; name: string; clients: number }[]; total: number; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.slice(0, 6).map((i) => (
        <li key={i.key}>
          <div className="flex justify-between">
            <span>{i.name}</span>
            <span className="text-muted-foreground">
              {i.clients} of {total}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded bg-muted">
            <div className="h-full rounded bg-primary" style={{ width: `${(i.clients / total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
