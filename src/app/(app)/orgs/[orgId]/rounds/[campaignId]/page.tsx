import Link from "next/link";
import { adminPage, or404 } from "@/lib/org/page-guard";
import { roundParticipants } from "@/lib/services/reminders";
import { OrgNav } from "@/components/org/org-nav";
import { RoundReminders } from "@/components/org/round-reminders";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Round reminders" };

export default async function RoundPage({ params }: { params: Promise<{ orgId: string; campaignId: string }> }) {
  const { orgId, campaignId } = await params;
  const { user, admin } = await adminPage(orgId, `/rounds/${campaignId}`);
  const v = await or404(roundParticipants(user.id, orgId, campaignId));
  const waiting = v.people.filter((p) => !p.started).length;
  return (
    <div className="space-y-6">
      <OrgNav orgId={orgId} orgName={admin.org.name} active="rounds" />
      <Link href={`/orgs/${orgId}/rounds`} className="text-sm text-muted-foreground hover:underline">
        ← All rounds
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{v.campaign.name}</CardTitle>
          <CardDescription>
            {waiting} of {v.people.length} haven&apos;t set up their 360 yet. Reminders go to them, not their raters: each person reminds their own raters, and
            raters stay anonymous. At most 3 reminders per person, 2 days apart.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RoundReminders orgId={orgId} campaignId={campaignId} people={v.people.map((p) => ({ ...p, lastRemindedAt: p.lastRemindedAt?.toISOString() ?? null }))} />
        </CardContent>
      </Card>
    </div>
  );
}
