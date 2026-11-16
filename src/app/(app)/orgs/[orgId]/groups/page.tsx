import { adminPage, or404 } from "@/lib/org/page-guard";
import { orgOverview } from "@/lib/services/org";
import { db } from "@/lib/db";
import { OrgNav } from "@/components/org/org-nav";
import { CreateGroupForm, GroupMembersForm } from "@/components/org/org-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Teams & cohorts" };

export default async function GroupsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user } = await adminPage(orgId, "/groups");
  const o = await or404(orgOverview(user.id, orgId));
  const links = await db.orgGroupMember.findMany({ where: { group: { orgId } } });
  const people = o.members.map((m) => ({ id: m.id, name: m.name || m.email }));
  return (
    <div className="space-y-6">
      <OrgNav orgId={orgId} orgName={o.org.name} active="groups" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a team or cohort</CardTitle>
          <CardDescription>Teams are people who work together (team 360s, heatmaps). Cohorts are groups such as a leadership programme intake (before/after comparisons).</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateGroupForm orgId={orgId} />
        </CardContent>
      </Card>
      {o.groups.map((g) => (
        <Card key={g.id} data-testid="group-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {g.name} <Badge variant="secondary">{g.kind === "TEAM" ? "Team" : "Cohort"}</Badge>
            </CardTitle>
            <CardDescription>{g._count.members} people</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupMembersForm orgId={orgId} groupId={g.id} members={people} selected={links.filter((l) => l.groupId === g.id).map((l) => l.memberId)} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
