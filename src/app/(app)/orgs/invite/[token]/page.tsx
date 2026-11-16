import { requireUserId } from "@/lib/session";
import { orgInviteByToken } from "@/lib/services/org";
import { OrgInviteButtons } from "@/components/org/org-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Organization invitation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OrgInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await requireUserId(`/orgs/invite/${token}`);
  const invite = await orgInviteByToken(token);
  if (!invite)
    return (
      <Card className="mx-auto mt-6 max-w-lg">
        <CardHeader>
          <CardTitle>Invitation not available</CardTitle>
          <CardDescription>It has already been answered or withdrawn, or the link is incomplete.</CardDescription>
        </CardHeader>
      </Card>
    );
  return (
    <Card className="mx-auto mt-6 max-w-lg" data-testid="org-invite-landing">
      <CardHeader>
        <CardTitle>Join {invite.orgName} on Mirror</CardTitle>
        <CardDescription>
          {invite.orgName}&apos;s admins will see whether you take part in its 360 rounds and group averages built from at least 5 people. Your individual results stay
          private unless you choose to share them, and raters&apos; answers are never shown to anyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Sent to {invite.sentTo}.</p>
        <OrgInviteButtons token={token} />
      </CardContent>
    </Card>
  );
}
