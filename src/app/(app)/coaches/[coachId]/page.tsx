import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { publicCoach } from "@/lib/services/marketplace";
import { formatCents } from "@/lib/billing/catalog";
import { RequestIntroButton } from "@/components/coach/marketplace-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Coach" };

export default async function CoachProfilePage({ params }: { params: Promise<{ coachId: string }> }) {
  const { coachId } = await params;
  const user = await requireOnboardedUser(`/coaches/${coachId}`);
  const c = await publicCoach(coachId);
  if (!c) notFound();
  const coachEmail = (await db.user.findUnique({ where: { id: coachId }, select: { email: true } }))?.email ?? "";
  const existing = await db.coachClientLink.findFirst({ where: { clientId: user.id, status: { in: ["PENDING", "ACTIVE"] }, OR: [{ coachId }, { inviteEmail: coachEmail }] } });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/coaches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All coaches
      </Link>
      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">{c.brand}</p>
          <CardTitle className="flex flex-wrap items-center gap-2 text-2xl">
            {c.name} <Badge variant="secondary">Verified</Badge>
          </CardTitle>
          <p className="text-muted-foreground">{c.headline}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-line text-sm">{c.bio}</p>
          <div className="flex flex-wrap gap-1">
            {c.specialties.map((s) => (
              <Badge key={s} variant="outline">
                {s}
              </Badge>
            ))}
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Languages</dt>
              <dd>{c.languages.join(", ") || "–"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Per session</dt>
              <dd>{c.sessionPriceCents != null ? formatCents(c.sessionPriceCents) : "Ask the coach"}</dd>
            </div>
            {c.website && (
              <div>
                <dt className="text-muted-foreground">Website</dt>
                <dd>
                  <a href={c.website} className="underline" rel="noopener noreferrer nofollow" target="_blank">
                    {new URL(c.website).hostname}
                  </a>
                </dd>
              </div>
            )}
          </dl>
          {coachId === user.id ? (
            <p className="text-sm text-muted-foreground">This is your listing.</p>
          ) : existing ? (
            <Alert tone="info">
              You already have a {existing.status === "ACTIVE" ? "coaching relationship" : "pending invitation"} with {c.name}. See{" "}
              <Link href="/coaching" className="underline">
                Coaching
              </Link>
              .
            </Alert>
          ) : (
            <RequestIntroButton coachId={coachId} />
          )}
          <p className="text-xs text-muted-foreground">Sessions are arranged and paid directly with the coach.</p>
        </CardContent>
      </Card>
    </div>
  );
}
