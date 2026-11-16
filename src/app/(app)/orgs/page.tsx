import Link from "next/link";
import { Building } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { memberTasks, myOrgs } from "@/lib/services/org";
import { CreateOrgForm, OrgInviteButtons } from "@/components/org/org-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Organizations" };

export default async function OrgsPage() {
  const user = await requireOnboardedUser("/orgs");
  const { memberships, invites } = await myOrgs(user.id);
  const tasks = await memberTasks(user.id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
        <p className="text-muted-foreground">Run 360s for teams and cohorts. Admins see group averages; individual results stay private unless each person chooses to share.</p>
      </div>

      {tasks.map((t) => (
        <Card key={t.campaignId} data-testid="org-task">
          <CardHeader>
            <CardTitle className="text-base">
              {t.orgName}: set up your 360 for “{t.name}”
            </CardTitle>
            <CardDescription>{t.dueAt ? `Please finish by ${t.dueAt.toLocaleDateString()}.` : "About 5 minutes to set up."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/assessments/new?campaign=${t.campaignId}`}>Set up my 360</Link>
            </Button>
          </CardContent>
        </Card>
      ))}

      {invites.map((m) => (
        <Card key={m.id} data-testid="org-invite">
          <CardHeader>
            <CardTitle className="text-base">You&apos;re invited to {m.org.name}</CardTitle>
            <CardDescription>Admins will see whether you take part and group averages (at least 5 people). Your individual results stay private unless you share them.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrgInviteButtons memberId={m.id} />
          </CardContent>
        </Card>
      ))}

      {memberships.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {memberships.map((m) => (
                <li key={m.id}>
                  <Link href={`/orgs/${m.orgId}`} className="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-accent/50" data-testid="org-row">
                    <span className="flex items-center gap-2 font-medium">
                      <Building className="size-4 text-muted-foreground" aria-hidden /> {m.org.name}
                    </span>
                    <Badge variant={m.role === "ADMIN" ? "default" : "secondary"}>{m.role === "ADMIN" ? "Admin" : "Member"}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start an organization</CardTitle>
          <CardDescription>Free while Mirror is in early access. You&apos;ll be its first admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrgForm />
        </CardContent>
      </Card>
    </div>
  );
}
