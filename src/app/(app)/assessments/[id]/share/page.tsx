import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireOwnedAssessment } from "@/lib/session";
import { getReportForOwner } from "@/lib/services/reports";
import { badgeInfo, linkedInAddUrl, linkedInShareUrl, listShares, shareUrl } from "@/lib/services/share";
import { CopyButton, CreateShareForm, RevokeButton } from "@/components/share/share-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Share" };
const KIND = { BADGE: "Verified strengths badge", SUMMARY: "One-page summary", REPORT: "Full report" } as const;

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, assessment } = await requireOwnedAssessment(id);
  const r = await getReportForOwner(userId, id);
  const links = await listShares(userId, id);
  const badge = r.status === "ok" ? badgeInfo(r.report, assessment.closedAt ?? new Date()) : null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/assessments/${id}/report`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Back to report
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Share {assessment.title}</h1>
      </div>
      <Alert tone="info" className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Your report is private. A link shows only what you pick, never raters&apos; comments or anything that could identify a rater, and you can revoke it at any
          time. Anyone with the link can view it.
        </span>
      </Alert>
      {r.status !== "ok" || !r.report.anonymity.available ? (
        <Alert tone="warning">Sharing is available once this 360 has closed with enough responses.</Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create a link</CardTitle>
            {badge && badge.strengths.length > 0 && (
              <CardDescription>
                Badge preview: {badge.strengths.map((s) => s.name).join(", ")} · backed by {badge.raters} raters
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <CreateShareForm assessmentId={id} />
          </CardContent>
        </Card>
      )}
      {links.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your links</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3" data-testid="share-links">
              {links.map((l) => {
                const url = shareUrl(l.id);
                const off = !!l.revokedAt || (l.expiresAt != null && l.expiresAt < new Date());
                return (
                  <li key={l.id} className="space-y-2 rounded-lg border p-3 text-sm" data-testid="share-link">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium">
                        {KIND[l.kind]} {off ? <Badge variant="outline">{l.revokedAt ? "Revoked" : "Expired"}</Badge> : <Badge variant="secondary">Live</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {l.views} view{l.views === 1 ? "" : "s"} · created {l.createdAt.toLocaleDateString()}
                        {l.expiresAt && ` · expires ${l.expiresAt.toLocaleDateString()}`}
                      </span>
                    </div>
                    {!off && (
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs" data-testid="share-url">
                          {url}
                        </code>
                        <CopyButton text={url} />
                        <Button asChild size="sm" variant="outline">
                          <a href={`/s/${l.id}`} target="_blank" rel="noopener">
                            Open
                          </a>
                        </Button>
                        {l.kind === "BADGE" && badge && (
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={linkedInAddUrl({ name: `Verified strengths: ${badge.strengths.map((s) => s.name).join(", ")}`, url, id: l.id, issued: badge.issued })}
                              target="_blank"
                              rel="noopener"
                            >
                              Add to LinkedIn profile
                            </a>
                          </Button>
                        )}
                        <Button asChild size="sm" variant="ghost">
                          <a href={linkedInShareUrl(url)} target="_blank" rel="noopener">
                            Post on LinkedIn
                          </a>
                        </Button>
                        <RevokeButton assessmentId={id} id={l.id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
