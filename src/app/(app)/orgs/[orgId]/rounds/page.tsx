import { adminPage, or404 } from "@/lib/org/page-guard";
import { orgOverview } from "@/lib/services/org";
import { frameworksForUser } from "@/lib/services/frameworks";
import { OrgNav } from "@/components/org/org-nav";
import { ParticipationBar } from "@/components/org/stats";
import { CreateCampaignForm } from "@/components/org/org-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "360 rounds" };

export default async function RoundsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user } = await adminPage(orgId, "/rounds");
  const o = await or404(orgOverview(user.id, orgId));
  const frameworks = await frameworksForUser(user.id);
  const fwName = new Map(frameworks.map((f) => [f.id, f.name]));
  return (
    <div className="space-y-6">
      <OrgNav orgId={orgId} orgName={o.org.name} active="rounds" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start a 360 round</CardTitle>
          <CardDescription>
            Everyone taking part gets an email to set up their own 360 on the same questionnaire. Each person rates themselves and invites their raters; the report
            belongs to them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCampaignForm orgId={orgId} groups={o.groups.map((g) => ({ id: g.id, name: g.name, kind: g.kind }))} frameworks={frameworks.map((f) => ({ id: f.id, name: f.name }))} />
        </CardContent>
      </Card>
      {o.campaigns.map((c) => (
        <Card key={c.id} data-testid="round-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {c.name} {c.teamMode && <Badge variant="secondary">Team 360</Badge>}
            </CardTitle>
            <CardDescription>
              {c.group} · {fwName.get(c.frameworkId) ?? "Questionnaire"} · started {c.createdAt.toLocaleDateString()}
              {c.dueAt && ` · due ${c.dueAt.toLocaleDateString()}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ParticipationBar p={c.stats} label={c.name} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
