import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { db } from "@/lib/db";
import { memberView, orgOverview } from "@/lib/services/org";
import { or404 } from "@/lib/org/page-guard";
import { OrgNav } from "@/components/org/org-nav";
import { ParticipationBar } from "@/components/org/stats";
import { ConsentPanel, LeaveOrgButton } from "@/components/org/org-controls";
import { StatusBadge } from "@/components/assessment/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Organization" };

export default async function OrgHome({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const user = await requireOnboardedUser(`/orgs/${orgId}`);
  const me = await db.orgMember.findFirst({ where: { orgId, userId: user.id, status: "ACTIVE" } });
  if (!me) notFound();
  if (me.role !== "ADMIN") return <MemberHome orgId={orgId} userId={user.id} />;

  const o = await or404(orgOverview(user.id, orgId));
  const active = o.members.filter((m) => m.status === "ACTIVE").length;
  const invited = o.members.filter((m) => m.status === "INVITED").length;
  return (
    <div className="space-y-6">
      <OrgNav orgId={orgId} orgName={o.org.name} active="overview" />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Members" value={active} hint={invited ? `${invited} invited` : undefined} />
        <Stat label="Teams" value={o.groups.filter((g) => g.kind === "TEAM").length} />
        <Stat label="Cohorts" value={o.groups.filter((g) => g.kind === "COHORT").length} />
        <Stat label="360 rounds" value={o.campaigns.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Org strengths and gaps</CardTitle>
          <CardDescription>
            Others&apos; average across everyone&apos;s latest org 360. Each figure needs at least {o.min} people.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!o.profile.available ? (
            <Alert tone="info" data-testid="org-profile-locked">
              Appears once at least {o.min} people have a completed org 360 ({o.profile.people} so far).
            </Alert>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2" data-testid="org-strengths">
              <div>
                <h3 className="mb-2 text-sm font-medium">Strengths</h3>
                <ul className="space-y-1 text-sm">
                  {o.strengths.map((c) => (
                    <li key={c.key} className="flex justify-between">
                      <span>{c.name}</span>
                      <span className="tabular-nums">{c.others.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Gaps</h3>
                <ul className="space-y-1 text-sm">
                  {o.gaps.map((c) => (
                    <li key={c.key} className="flex justify-between">
                      <span>{c.name}</span>
                      <span className="tabular-nums">{c.others.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Participation by 360 round</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {o.campaigns.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No 360 rounds yet. <Link href={`/orgs/${orgId}/rounds`} className="underline">Start one</Link>.
            </p>
          )}
          {o.campaigns.map((c) => (
            <div key={c.id} className="space-y-2">
              <p className="text-sm">
                <span className="font-medium">{c.name}</span> <span className="text-muted-foreground">· {c.group}</span> {c.teamMode && <Badge variant="secondary">Team 360</Badge>}
                {c.dueAt && <span className="text-muted-foreground"> · due {c.dueAt.toLocaleDateString()}</span>}
              </p>
              <ParticipationBar p={c.stats} label={c.name} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

async function MemberHome({ orgId, userId }: { orgId: string; userId: string }) {
  const v = await or404(memberView(userId, orgId));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/orgs" className="hover:underline">
              Organizations
            </Link>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{v.org.name}</h1>
          {v.groups.length > 0 && <p className="text-sm text-muted-foreground">{v.groups.map((g) => g.name).join(" · ")}</p>}
        </div>
        <LeaveOrgButton orgId={orgId} orgName={v.org.name} />
      </div>
      {v.tasks.map((t) => (
        <Card key={t.campaignId} data-testid="org-task">
          <CardHeader>
            <CardTitle className="text-base">Set up your 360 for “{t.name}”</CardTitle>
            {t.dueAt && <CardDescription>Please finish by {t.dueAt.toLocaleDateString()}.</CardDescription>}
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/assessments/new?campaign=${t.campaignId}`}>Set up my 360</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your privacy</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsentPanel orgId={orgId} orgName={v.org.name} initial={{ shareReports: v.member.shareReports, shareTalentGrid: v.member.shareTalentGrid }} />
        </CardContent>
      </Card>
      {v.assessments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your 360s in {v.org.name}&apos;s rounds</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border text-sm">
              {v.assessments.map((a) => (
                <li key={a.id}>
                  <Link href={a.status === "CLOSED" ? `/assessments/${a.id}/report` : `/assessments/${a.id}`} className="flex items-center justify-between px-3 py-2 hover:bg-accent/50">
                    <span>{a.orgCampaign?.name ?? a.title}</span>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
