import { requireUserId } from "@/lib/session";
import { inviteByToken } from "@/lib/services/coach";
import { RespondButtons } from "@/components/coach/client-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Coaching invitation", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await requireUserId(`/coaching/invite/${token}`);
  const invite = await inviteByToken(token);
  if (!invite) {
    return (
      <Card className="mx-auto mt-6 max-w-lg">
        <CardHeader>
          <CardTitle>Invitation not available</CardTitle>
          <CardDescription>This invitation has already been answered, was withdrawn, or the link is incomplete.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card className="mx-auto mt-6 max-w-lg" data-testid="invite-landing">
      <CardHeader>
        <CardTitle>{invite.youAre === "client" ? `${invite.from} would like to coach you` : `${invite.from} would like you to be their coach`}</CardTitle>
        <CardDescription>
          {invite.youAre === "client"
            ? "If you accept, you choose what they can see (reports, comments, goals, plan) and can stop sharing at any time. Individual raters' answers are never shared."
            : `You'll get a coach workspace with what ${invite.from} chooses to share. Accepting creates a coach profile you can edit.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Sent to {invite.sentTo}.</p>
        <RespondButtons token={token} next={invite.youAre === "coach" ? "/coach" : "/coaching"} />
      </CardContent>
    </Card>
  );
}
