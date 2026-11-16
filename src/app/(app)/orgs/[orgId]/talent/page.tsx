import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { adminPage, or404 } from "@/lib/org/page-guard";
import { talentGrid } from "@/lib/services/org";
import { OrgNav } from "@/components/org/org-nav";
import { PerformanceSelect } from "@/components/org/org-controls";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Talent grid" };
const PERF = ["", "Low", "Medium", "High"];
const BEH = ["", "Developing", "Solid", "Strong"];

export default async function TalentPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, admin } = await adminPage(orgId, "/talent");
  const t = await or404(talentGrid(user.id, orgId));
  return (
    <div className="space-y-6">
      <OrgNav orgId={orgId} orgName={admin.org.name} active="talent" />
      <Alert tone="info" className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Only people who chose “Include me on the talent grid” appear here ({t.consenting.length}; {t.notConsenting} others are not shown). The vertical axis is
          others&apos; overall average from their latest org 360 (demonstrated behaviours). The horizontal axis is a performance rating an admin enters. Use it to plan
          development conversations, not as a hiring or pay decision on its own. Raters never see it.
        </span>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Talent grid</CardTitle>
          <CardDescription>Behaviours: developing (under 3.0) · solid (3.0–3.9) · strong (4.0 and above), on a 1–5 scale.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <div className="flex items-center">
              <span className="-rotate-90 whitespace-nowrap text-xs text-muted-foreground">360 behaviours →</span>
            </div>
            <div>
              <div className="grid grid-cols-3 gap-2" data-testid="nine-box">
                {t.grid.cells.map((c) => (
                  <div key={`${c.behaviours}-${c.performance}`} className="min-h-24 rounded-lg border p-2" aria-label={`${BEH[c.behaviours]} behaviours, ${PERF[c.performance]} performance`} role="group">
                    <p className="mb-1 text-[11px] text-muted-foreground">
                      {BEH[c.behaviours]} · {PERF[c.performance]}
                    </p>
                    <ul className="space-y-0.5 text-sm">
                      {c.members.map((m) => (
                        <li key={m.memberId}>
                          <Link href={`/orgs/${orgId}/people/${m.memberId}`} className="hover:underline">
                            {m.name}
                          </Link>{" "}
                          <span className="text-xs text-muted-foreground">{m.score.toFixed(1)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-center text-xs text-muted-foreground">Performance (admin-entered) →</p>
            </div>
          </div>
          {t.grid.unplaced.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Not placed: {t.grid.unplaced.map((u) => `${u.name} (${u.reason.toLowerCase()})`).join("; ")}.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance ratings</CardTitle>
          <CardDescription>Only for people on the talent grid. Changes are audit-logged.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border text-sm">
            {t.consenting.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-3 py-2">
                <span>{m.name}</span>
                <PerformanceSelect orgId={orgId} memberId={m.id} value={m.performance} name={m.name} />
              </li>
            ))}
            {t.consenting.length === 0 && <li className="px-3 py-2 text-muted-foreground">Nobody has opted in yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
