import { redirect } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getCoachProfile } from "@/lib/services/coach";
import { CoachNav } from "@/components/coach/coach-nav";
import Link from "next/link";
import { CoachProfileForm } from "@/components/coach/coach-forms";
import { ListingForm } from "@/components/coach/marketplace-controls";
import { coachHasBranding, coachPlan } from "@/lib/services/billing";
import { coachReferrals } from "@/lib/services/marketplace";
import { COACH_CLIENT_LIMIT, PLANS, formatCents } from "@/lib/billing/catalog";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Coach profile" };

export default async function CoachSettings() {
  const user = await requireOnboardedUser("/coach/settings");
  const p = await getCoachProfile(user.id);
  if (!p) redirect("/coach");
  const plan = await coachPlan(user.id);
  const branding = await coachHasBranding(user.id);
  const active = await db.coachClientLink.count({ where: { coachId: user.id, status: { in: ["ACTIVE", "PENDING"] } } });
  const { refs, dueCents } = await coachReferrals(user.id);
  return (
    <div className="space-y-6">
      <CoachNav active="settings" brand={{ name: p.brandName, color: p.brandColor }} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile & branding</CardTitle>
          <CardDescription>
            Questionnaires you build under Questionnaires are available to your active clients when they set up a 360.
            {!branding && " White-label branding shows on client reports with a Coach Starter or Coach Pro plan."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CoachProfileForm initial={{ displayName: p.displayName, brandName: p.brandName ?? "", brandColor: p.brandColor ?? "", website: p.website ?? "" }} />
        </CardContent>
      </Card>
      <Card data-testid="coach-plan">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Plan <Badge>{PLANS[plan].label}</Badge>
          </CardTitle>
          <CardDescription>
            {active} of {COACH_CLIENT_LIMIT[plan]} active clients.{" "}
            <Link href="/billing" className="underline">
              Change plan or buy report credits
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marketplace listing</CardTitle>
          <CardDescription>
            {p.verified ? "Your profile is verified." : "New listings appear after a quick verification by the Mirror team."} Clients find you under Find a coach.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ListingForm
            canList={plan !== "COACH_FREE" || process.env.BILLING_ENFORCED === "false"}
            verified={p.verified}
            initial={{ listed: p.listed, headline: p.headline ?? "", bio: p.bio ?? "", specialties: p.specialties.join(", "), languages: p.languages.join(", "), price: p.sessionPriceCents != null ? String(p.sessionPriceCents / 100) : "" }}
          />
        </CardContent>
      </Card>
      {refs.length > 0 && (
        <Card data-testid="referrals">
          <CardHeader>
            <CardTitle className="text-base">Marketplace referrals</CardTitle>
            <CardDescription>Fees due for accepted referrals: {formatCents(dueCents)}. These are invoiced separately.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {refs.map((r) => (
                <li key={r.id}>
                  {r.createdAt.toISOString().slice(0, 10)} · {r.status.toLowerCase()} · {formatCents(r.feeCents)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
