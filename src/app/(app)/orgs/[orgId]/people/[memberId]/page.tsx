import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { adminPage, or404 } from "@/lib/org/page-guard";
import { memberForAdmin } from "@/lib/services/org";
import { StatusBadge } from "@/components/assessment/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Person" };

export default async function MemberPage({ params }: { params: Promise<{ orgId: string; memberId: string }> }) {
  const { orgId, memberId } = await params;
  const { user } = await adminPage(orgId, `/people/${memberId}`);
  const { member: m, sessions } = await or404(memberForAdmin(user.id, orgId, memberId));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/orgs/${orgId}/people`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> People
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{m.name || m.email}</h1>
        <p className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground">
          {m.email}
          {m.groups.map((g) => (
            <Badge key={g.groupId} variant="outline">
              {g.group.name}
            </Badge>
          ))}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Org 360s</CardTitle>
          <CardDescription>
            {m.shareReports ? "Shares reports with admins: open a closed 360 to see results (scores and themes; comments are never shown to admins)." : "Doesn't share reports, so only progress is shown."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  {s.shared ? (
                    <Link href={`/orgs/${orgId}/people/${memberId}/reports/${s.id}`} className="font-medium hover:underline">
                      {s.campaign}
                    </Link>
                  ) : (
                    <span className="font-medium">{s.campaign}</span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {s.responses.done}/{s.responses.total} responded{s.closedAt && ` · closed ${s.closedAt.toLocaleDateString()}`}
                  </span>
                </span>
                {s.status === "CLOSED" && !s.shared ? <Lock className="size-4 text-muted-foreground" aria-label="Private" /> : <StatusBadge status={s.status} />}
              </li>
            ))}
            {sessions.length === 0 && <li className="px-3 py-2 text-muted-foreground">No org 360s yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
