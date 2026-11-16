import { BadgeCheck, ShieldCheck } from "lucide-react";
import { clientIp, hit } from "@/lib/rate-limit";
import { publicShare } from "@/lib/services/share";
import { goalLabel } from "@/lib/constants";
import { ReportView } from "@/components/report/report-view";
import { CompetencyRadar } from "@/components/report/radar-chart";
import { PrintButton } from "@/components/share/print-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared from Mirror", robots: { index: false, follow: false } };

function Gone({ title, body }: { title: string; body: string }) {
  return (
    <Card className="mx-auto mt-6 max-w-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export default async function SharedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await hit("shareViewIp", await clientIp())).ok) return <Gone title="Please slow down" body="Too many requests from your network. Please try again in a few minutes." />;
  const s = await publicShare(id);
  if (!s) return <Gone title="This link isn't available" body="It may have been revoked or expired by the person who shared it." />;
  const r = s.report;
  const name = (k: string) => r.competencies.find((c) => c.key === k)?.name ?? k;
  const footer = (
    <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> Shared by {s.name} from Mirror, a 360° feedback tool for personal development, not a performance or hiring
      assessment. Scores combine at least {r.anonymity.min} raters per group; raters&apos; comments are never shown.
    </p>
  );

  if (s.kind === "BADGE") {
    const b = s.badge;
    return (
      <div className="mx-auto max-w-xl">
        <Card data-testid="shared-badge" className="overflow-hidden">
          <div className="h-2 bg-primary" />
          <CardHeader>
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <BadgeCheck className="size-5" aria-hidden /> Verified strengths
            </p>
            <CardTitle className="text-2xl">{s.name}</CardTitle>
            <CardDescription>
              Based on 360° feedback from {b.raters} people in {b.groups} group{b.groups === 1 ? "" : "s"} · {s.issued.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="space-y-2">
              {b.strengths.map((x) => (
                <li key={x.name} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="font-medium">{x.name}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {x.others.toFixed(1)} / {b.scaleMax}
                  </span>
                </li>
              ))}
            </ol>
            {s.note && <p className="text-sm text-muted-foreground">{s.note}</p>}
            <p className="text-xs text-muted-foreground">Verification ID: {s.id}. This page is the verification: it comes straight from the frozen report on Mirror.</p>
          </CardContent>
        </Card>
        {footer}
      </div>
    );
  }

  if (s.kind === "SUMMARY") {
    return (
      <div className="mx-auto max-w-3xl space-y-4" data-testid="shared-summary">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">360° feedback summary · {goalLabel(r.assessment.goal)}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{s.name}</h1>
            <p className="text-sm text-muted-foreground">
              {r.anonymity.othersN} raters · {s.issued.toLocaleDateString()}
            </p>
          </div>
          <PrintButton />
        </div>
        {s.note && <p className="text-sm">{s.note}</p>}
        {s.sections.includes("narrative") && (
          <Card>
            <CardContent className="pt-5 text-sm sm:pt-6">{r.summary.narrative}</CardContent>
          </Card>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {s.sections.includes("strengths") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {r.summary.strengths.map((k) => (
                    <li key={k}>{name(k)}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {s.sections.includes("growth") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Growth areas</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {r.summary.growthAreas.map((k) => (
                    <li key={k}>{name(k)}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
        {s.sections.includes("chart") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Self vs others by competency</CardTitle>
            </CardHeader>
            <CardContent>
              <CompetencyRadar report={r} visibleGroups={[]} />
            </CardContent>
          </Card>
        )}
        {footer}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="shared-report">
      {s.note && <p className="text-sm">{s.note}</p>}
      <ReportView report={r} generatedAt={s.generatedAt.toISOString()} mode="coach" />
      {footer}
    </div>
  );
}
