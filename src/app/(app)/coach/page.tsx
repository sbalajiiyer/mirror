import Link from "next/link";
import { CalendarClock, Lock } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import {
  coachRequests,
  getCoachProfile,
  portfolio,
} from "@/lib/services/coach";
import { CoachNav } from "@/components/coach/coach-nav";
import { CoachProfileForm } from "@/components/coach/coach-forms";
import {
  EmailInviteForm,
  EndLinkButton,
  RespondButtons,
} from "@/components/coach/client-controls";
import { StatusBadge } from "@/components/assessment/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "Coach workspace" };

export default async function CoachHome() {
  const user = await requireOnboardedUser("/coach");
  const profile = await getCoachProfile(user.id);
  if (!profile) {
    const requests = await coachRequests(user.id);
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {requests.length > 0 && <Requests requests={requests} />}
        <Card>
          <CardHeader>
            <CardTitle>Set up your coach workspace</CardTitle>
            <CardDescription>
              See every client&apos;s 360 status and response rates, read the
              reports they share with you, prepare for sessions, and spot
              patterns across clients. Free while Mirror is in early access.
              Clients decide what you can see.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CoachProfileForm
              setup
              initial={{
                displayName: user.profile.displayName,
                brandName: "",
                brandColor: "",
                website: "",
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }
  const p = await portfolio(user.id);
  return (
    <div className="space-y-6">
      <CoachNav
        active="clients"
        brand={{ name: profile.brandName, color: profile.brandColor }}
      />
      {p.incoming.length > 0 && <Requests requests={p.incoming} />}

      {p.clients.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground sm:pt-6">
            No clients yet. Invite one below, or ask your clients to invite you
            from their Coaching page.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Clients ({p.clients.length})
            </CardTitle>
            <CardDescription>
              Status of every client&apos;s 360s, response rates and what&apos;s
              coming up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {p.clients.map((c) => (
                <li
                  key={c.clientId}
                  className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[1.4fr_1.6fr_1fr_auto] sm:items-center"
                  data-testid="client-row"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/coach/clients/${c.clientId}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.surveys} survey{c.surveys === 1 ? "" : "s"}
                      {c.activeGoals != null &&
                        ` · ${c.activeGoals} active goal${c.activeGoals === 1 ? "" : "s"}`}
                      {!c.sharing.reports && (
                        <span className="ml-1 inline-flex items-center gap-0.5">
                          · <Lock className="size-3" aria-hidden /> reports not
                          shared
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="min-w-0">
                    {c.openSession ? (
                      <>
                        <span className="flex items-center gap-2">
                          <StatusBadge status={c.openSession.status as never} />
                          <span className="truncate">{c.openSession.name}</span>
                        </span>
                        {c.openSession.responses &&
                          c.openSession.responses.total > 0 && (
                            <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <Progress
                                value={
                                  (c.openSession.responses.done /
                                    c.openSession.responses.total) *
                                  100
                                }
                                className="h-1.5 w-24"
                                aria-label={`${c.name} response rate`}
                              />
                              {c.openSession.responses.done}/
                              {c.openSession.responses.total} responded
                            </span>
                          )}
                      </>
                    ) : c.latest ? (
                      <span className="text-muted-foreground">
                        Latest: {c.latest.name}
                        {c.latest.score != null &&
                          ` · others' avg ${c.latest.score.toFixed(1)}`}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">No 360 yet</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.nextMeeting ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3.5" aria-hidden />{" "}
                        {c.nextMeeting.at.toLocaleDateString()}
                      </span>
                    ) : (
                      "No session booked"
                    )}
                    {c.nextPulse && (
                      <span className="block">
                        Pulse due {c.nextPulse.toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/coach/clients/${c.clientId}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Prepare
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite a client</CardTitle>
          <CardDescription>
            They get an email and choose what to share with you when they
            accept.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <EmailInviteForm
            label="Client's email"
            button="Send invitation"
            testId="invite-client"
            onSubmit="client"
          />
          {p.pending.length > 0 && (
            <ul
              className="space-y-1 text-sm text-muted-foreground"
              data-testid="pending-invites"
            >
              {p.pending.map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <Badge variant="outline">Invited</Badge> {l.email}
                  <EndLinkButton
                    linkId={l.id}
                    label="Withdraw"
                    confirmText={`Withdraw the invitation to ${l.email}?`}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Requests({ requests }: { requests: { id: string; from: string }[] }) {
  return (
    <>
      {requests.map((r) => (
        <Card key={r.id} data-testid="coach-request">
          <CardHeader>
            <CardTitle className="text-base">
              {r.from} asked you to be their coach
            </CardTitle>
            <CardDescription>
              Accept to see what {r.from} chooses to share. They can change or
              stop sharing at any time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RespondButtons linkId={r.id} />
          </CardContent>
        </Card>
      ))}
    </>
  );
}
