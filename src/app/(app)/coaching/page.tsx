import Link from "next/link";
import { CalendarClock, GraduationCap } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { clientCoaching } from "@/lib/services/coach";
import { CompanyOfferButtons, EmailInviteForm, EndLinkButton, RespondButtons, SharingPanel } from "@/components/coach/client-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Coaching" };

export default async function CoachingPage() {
  const user = await requireOnboardedUser("/coaching");
  const c = await clientCoaching(user.id);
  const coachName = (l: (typeof c.active)[number]) => l.coach?.coachProfile?.displayName ?? l.coach?.name ?? "Your coach";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Coaching</h1>
          <p className="text-muted-foreground">Work with a coach on your feedback. You choose what they can see, and you can stop at any time.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/coach">
            <GraduationCap /> {c.isCoach ? "My coach workspace" : "I'm a coach"}
          </Link>
        </Button>
      </div>

      {c.offers.map((l) => (
        <Card key={l.id} data-testid="company-coaching-offer">
          <CardHeader>
            <CardTitle className="text-base">{c.companies.get(l.orgId!) ?? "Your company"} is offering you coaching</CardTitle>
            <CardDescription>
              With {l.coach?.coachProfile?.displayName ?? l.coach?.name ?? l.inviteEmail}, paid for by {c.companies.get(l.orgId!) ?? "your company"}. If you accept, the
              coach is invited and you choose what they can see. Your company never sees what you share or discuss.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyOfferButtons linkId={l.id} />
          </CardContent>
        </Card>
      ))}

      {c.incoming.map((l) => (
        <Card key={l.id} data-testid="incoming-invite">
          <CardHeader>
            <CardTitle className="text-base">{l.coach?.coachProfile?.displayName ?? l.coach?.name ?? "A coach"} invited you to coaching</CardTitle>
            <CardDescription>
              If you accept, they&apos;ll see your reports, progress and goals (you can change this straight after). Individual raters&apos; answers are never
              shared with anyone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RespondButtons linkId={l.id} />
          </CardContent>
        </Card>
      ))}

      {c.active.length === 0 && c.incoming.length === 0 && (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground sm:pt-6">You&apos;re not working with a coach on Mirror yet.</CardContent>
        </Card>
      )}

      {c.active.map((l) => (
        <Card key={l.id} data-testid="coach-link">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">{coachName(l)}</CardTitle>
                <CardDescription>
                  Your coach since {l.acceptedAt?.toLocaleDateString()}
                  {l.orgId && ` · paid by ${c.companies.get(l.orgId) ?? "your company"}`}
                  {l.coach?.coachProfile?.brandName && ` · ${l.coach.coachProfile.brandName}`}
                </CardDescription>
              </div>
              <EndLinkButton linkId={l.id} confirmText={`Stop coaching with ${coachName(l)}? They will lose access to everything you shared straight away.`} />
            </div>
          </CardHeader>
          <CardContent>
            <SharingPanel
              linkId={l.id}
              coachName={coachName(l)}
              initial={{ shareReports: l.shareReports, shareComments: l.shareComments, shareGoals: l.shareGoals, sharePlan: l.sharePlan, showBranding: l.showBranding }}
            />
          </CardContent>
        </Card>
      ))}

      {c.meetings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" aria-hidden /> Upcoming coaching sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {c.meetings.map((m) => (
                <li key={m.id}>
                  {m.scheduledAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} with {m.coachName}
                  {m.topic && <span className="text-muted-foreground"> · {m.topic}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite your coach</CardTitle>
          <CardDescription>
            We&apos;ll email them an invitation. They only see what you choose to share, after they accept. No coach yet?{" "}
            <Link href="/coaches" className="underline">
              Find a verified coach
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <EmailInviteForm label="Coach's email" button="Send invitation" testId="invite-coach" onSubmit="coach" />
          {c.sent.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {c.sent.map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <Badge variant="outline">Waiting</Badge> {l.inviteEmail}
                  <EndLinkButton linkId={l.id} label="Withdraw" confirmText={`Withdraw the invitation to ${l.inviteEmail}?`} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
