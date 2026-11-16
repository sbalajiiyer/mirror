import Link from "next/link";
import { adminPage, or404 } from "@/lib/org/page-guard";
import { compareCohorts, orgOverview, teamAnalytics } from "@/lib/services/org";
import { OrgNav } from "@/components/org/org-nav";
import { TeamRadar } from "@/components/org/team-radar";
import { heatColor, heatInk } from "@/components/report/palette";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Org analytics" };
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
type Search = { team?: string; round?: string; ag?: string; ar?: string; bg?: string; br?: string };

export default async function OrgAnalytics({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<Search> }) {
  const { orgId } = await params;
  const sp = await searchParams;
  const { user } = await adminPage(orgId, "/analytics");
  const o = await or404(orgOverview(user.id, orgId));
  const teams = o.groups;
  const teamId = sp.team && teams.some((t) => t.id === sp.team) ? sp.team : teams[0]?.id;
  const round = sp.round && o.campaigns.some((c) => c.id === sp.round) ? sp.round : undefined;
  const t = teamId ? await or404(teamAnalytics(user.id, orgId, teamId, round)) : null;
  const cmp = sp.ag !== undefined || sp.bg !== undefined ? await or404(compareCohorts(user.id, orgId, { groupId: sp.ag || null, campaignId: sp.ar || null }, { groupId: sp.bg || null, campaignId: sp.br || null })) : null;
  const scaleMax = 5;

  return (
    <div className="space-y-6">
      <OrgNav orgId={orgId} orgName={o.org.name} active="analytics" />
      <p className="text-sm text-muted-foreground">
        Built from members&apos; latest org 360s. Every figure needs at least {o.min} people; people appear by name only if they chose to share their reports.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team view</CardTitle>
          <form method="get" className="flex flex-wrap items-end gap-2 pt-2" aria-label="Choose team">
            <label className="grid gap-1 text-xs font-medium">
              Team or cohort
              <select name="team" defaultValue={teamId} className={sel}>
                {teams.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              360 round
              <select name="round" defaultValue={round ?? ""} className={sel}>
                <option value="">Latest of any round</option>
                {o.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="sm" className="h-9">
              Show
            </Button>
          </form>
        </CardHeader>
        <CardContent className="space-y-6">
          {!t ? (
            <p className="text-sm text-muted-foreground">
              Add a team first under <Link href={`/orgs/${orgId}/groups`} className="underline">Teams &amp; cohorts</Link>.
            </p>
          ) : !t.profile.available ? (
            <Alert tone="info" data-testid="team-locked">
              {t.group.name} has {t.withResults} of {t.members} people with completed results. Team figures appear at {o.min}.
            </Alert>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                <TeamRadar
                  teamName={t.group.name}
                  max={scaleMax}
                  data={t.profile.competencies.map((c) => ({ name: c.name, team: c.others, org: t.orgProfile.competencies.find((x) => x.key === c.key)?.others ?? null }))}
                />
                <table className="w-full self-start text-sm" data-testid="team-dynamics">
                  <caption className="mb-2 text-left text-xs text-muted-foreground">
                    Team dynamics: {t.withResults} people. Spread = how differently members are seen (higher means less consistent).
                  </caption>
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="font-normal">Competency</th>
                      <th className="text-right font-normal">Team</th>
                      <th className="text-right font-normal">Self</th>
                      <th className="text-right font-normal">Spread</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.profile.competencies.map((c) => (
                      <tr key={c.key} className="border-t">
                        <td className="py-1">{c.name}</td>
                        <td className="text-right tabular-nums">{c.others.toFixed(2)}</td>
                        <td className="text-right tabular-nums">{c.self?.toFixed(2) ?? "–"}</td>
                        <td className="text-right tabular-nums">{c.spread?.toFixed(2) ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Heatmap: people × competencies</h3>
                {t.heatmap.hiddenPeople > 0 && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Named rows are hidden because too few others haven&apos;t shared; showing the whole team instead.
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-1 text-xs" data-testid="team-heatmap">
                    <caption className="sr-only">Others&apos; average per person and competency</caption>
                    <thead>
                      <tr>
                        <th className="text-left font-normal text-muted-foreground">Person</th>
                        {t.heatmap.competencies.map((c) => (
                          <th key={c.key} className="font-normal text-muted-foreground">
                            {c.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.heatmap.rows.map((r) => (
                        <tr key={r.label}>
                          <th scope="row" className="whitespace-nowrap pr-2 text-left font-medium">
                            {r.memberId ? (
                              <Link href={`/orgs/${orgId}/people/${r.memberId}`} className="hover:underline">
                                {r.label}
                              </Link>
                            ) : (
                              r.label
                            )}
                          </th>
                          {t.heatmap.competencies.map((c) => {
                            const v = r.values[c.key];
                            return (
                              <td key={c.key} className="h-9 rounded text-center tabular-nums" style={v != null ? { background: heatColor(v, scaleMax), color: heatInk(v, scaleMax) } : undefined}>
                                {v != null ? v.toFixed(1) : "–"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compare cohorts</CardTitle>
          <CardDescription>Cohort vs cohort, or before vs after: the same cohort in two different 360 rounds.</CardDescription>
          <form method="get" className="grid gap-2 pt-2 sm:grid-cols-[1fr_1fr_auto]" aria-label="Choose what to compare">
            <input type="hidden" name="team" value={teamId ?? ""} />
            {(["a", "b"] as const).map((k) => (
              <fieldset key={k} className="flex flex-wrap gap-2 rounded-md border p-2">
                <legend className="px-1 text-xs font-medium">{k === "a" ? "Before / A" : "After / B"}</legend>
                <select name={`${k}g`} aria-label={`${k.toUpperCase()}: group`} defaultValue={(k === "a" ? sp.ag : sp.bg) ?? ""} className={sel}>
                  <option value="">Everyone</option>
                  {teams.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <select name={`${k}r`} aria-label={`${k.toUpperCase()}: round`} defaultValue={(k === "a" ? sp.ar : sp.br) ?? ""} className={sel}>
                  <option value="">Latest of any round</option>
                  {o.campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </fieldset>
            ))}
            <Button type="submit" size="sm" className="self-end">
              Compare
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          {cmp &&
            (!cmp.available ? (
              <Alert tone="info" data-testid="compare-locked">
                Each side needs at least {o.min} people with results ({cmp.a.label}: {cmp.a.people}; {cmp.b.label}: {cmp.b.people}).
              </Alert>
            ) : (
              <table className="w-full text-sm" data-testid="cohort-compare">
                <caption className="mb-2 text-left text-xs text-muted-foreground">
                  {cmp.a.label} ({cmp.a.people}) → {cmp.b.label} ({cmp.b.people})
                </caption>
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="font-normal">Competency</th>
                    <th className="text-right font-normal">A</th>
                    <th className="text-right font-normal">B</th>
                    <th className="text-right font-normal">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {cmp.rows.map((r) => (
                    <tr key={r.key} className="border-t">
                      <td className="py-1">{r.name}</td>
                      <td className="text-right tabular-nums">{r.a.toFixed(2)}</td>
                      <td className="text-right tabular-nums">{r.b.toFixed(2)}</td>
                      <td className={`text-right tabular-nums ${r.delta > 0 ? "text-emerald-700 dark:text-emerald-400" : r.delta < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
                        {r.delta > 0 ? "+" : ""}
                        {r.delta.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
