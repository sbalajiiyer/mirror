import Link from "next/link";
import { ROLE_LABEL } from "@/lib/org/roles";
import { Eye, EyeOff } from "lucide-react";
import { adminPage, or404 } from "@/lib/org/page-guard";
import { orgOverview } from "@/lib/services/org";
import { OrgNav } from "@/components/org/org-nav";
import { InviteMembersForm, MemberRowActions } from "@/components/org/org-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "People" };

export default async function PeoplePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, admin } = await adminPage(orgId, "/people");
  const o = await or404(orgOverview(user.id, orgId));
  return (
    <div className="space-y-6">
      <OrgNav orgId={orgId} orgName={o.org.name} active="people" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite people</CardTitle>
          <CardDescription>Each person gets an email and joins with their own Mirror account. Paste a list exported from your HR system if you like.</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteMembersForm orgId={orgId} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">People ({o.members.length})</CardTitle>
          <CardDescription>
            <Eye className="inline size-3.5" aria-hidden /> shares reports with admins · individual results are otherwise private.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border text-sm" data-testid="people-list">
            {o.members.map((m) => (
              <li key={m.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[1.5fr_1fr_auto] sm:items-center" data-testid="person-row">
                <span className="min-w-0">
                  <Link href={`/orgs/${orgId}/people/${m.id}`} className="font-medium hover:underline">
                    {m.name || m.email}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  {m.status === "INVITED" ? <Badge variant="outline">Invited</Badge> : <Badge variant={m.role === "MEMBER" ? "secondary" : "default"}>{ROLE_LABEL[m.role]}</Badge>}
                  {m.status === "ACTIVE" &&
                    (m.shareReports ? <Eye className="size-4" aria-label="Shares reports" /> : <EyeOff className="size-4 text-muted-foreground" aria-label="Doesn't share reports" />)}
                  {m.groups.map((g) => (
                    <Badge key={g.groupId} variant="outline" className="font-normal">
                      {g.group.name}
                    </Badge>
                  ))}
                </span>
                <MemberRowActions orgId={orgId} memberId={m.id} role={m.role} status={m.status} isSelf={m.userId === user.id} canSetRoles={admin.role === "OWNER"} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
