import { db } from "@/lib/db";
import { aiCatalog } from "@/lib/ai/models";
import { monthlyUsage } from "@/lib/services/ai";
import { requireOnboardedUser } from "@/lib/session";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";
import { NudgeForm } from "./nudge-form";
import { ApiTokens, BenchmarkToggle } from "./data-forms";
import { deleteCategoryAction, deleteMyAccountAction } from "./data-actions";
import { DangerAction, DangerZone } from "@/components/danger-zone";
import { DELETION_GRACE_DAYS } from "@/lib/services/my-data";
import { listApiTokens } from "@/lib/services/api-tokens";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireOnboardedUser("/settings");
  const usage = await monthlyUsage(user.id);
  const tokens = await listApiTokens(user.id);
  const [chats, goals, plans, shares] = await Promise.all([
    db.coachChat.count({ where: { userId: user.id } }),
    db.goal.count({ where: { userId: user.id } }),
    db.developmentPlan.count({ where: { userId: user.id } }),
    db.shareLink.count({ where: { userId: user.id } }),
  ]);
  const counts = { chats, goals, plans, shares };
  const models = aiCatalog().map(({ id, label, description, tier, priceMicrosPer1k, available }) => ({ id, label, description, tier, priceMicrosPer1k, available }));
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsForm
        models={models}
        initial={{ aiModel: user.profile.aiModel, learningStyle: user.profile.learningStyle, feedbackTone: user.profile.feedbackTone }}
        usage={usage}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly nudges</CardTitle>
          <CardDescription>One short email a week with an action from your development plan and your goals. Off unless you switch it on.</CardDescription>
        </CardHeader>
        <CardContent>
          <NudgeForm initial={user.profile.nudgeDay} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data and API</CardTitle>
          <CardDescription>
            Benchmarks, and personal tokens for the read-only API. See{" "}
            <Link href="/settings/activity" className="underline">
              activity on your data
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <BenchmarkToggle optOut={user.profile.benchmarkOptOut} />
          <ApiTokens tokens={tokens.map((t) => ({ ...t, lastUsedAt: t.lastUsedAt?.toISOString() ?? null, revokedAt: t.revokedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString() }))} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coaching and organizations</CardTitle>
          <CardDescription>Work with a coach, coach others, or run 360s for a team or cohort.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/coaching">Coaching</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/orgs">Organizations</Link>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your data</CardTitle>
          <CardDescription>
            Download everything Mirror stores about you. Read how we handle it in the{" "}
            <Link href="/privacy" className="underline">
              privacy policy
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href="/api/me/export" download data-testid="export-my-data">
                Download my data (JSON)
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings/activity">Activity on your data</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <DangerZone>
        <DangerAction
          id="chats"
          title="Delete all AI coach conversations"
          description={`${counts.chats} conversation${counts.chats === 1 ? "" : "s"}.`}
          removes={["Every AI coach and role-play conversation, with all messages"]}
          phrase="delete"
          button="Delete conversations"
          action={deleteCategoryAction.bind(null, "chats")}
          done="Deleted {count} conversation(s)."
        />
        <DangerAction
          id="goals"
          title="Delete all goals and development plans"
          description={`${counts.goals} goal${counts.goals === 1 ? "" : "s"} and ${counts.plans} plan${counts.plans === 1 ? "" : "s"}.`}
          removes={["Every goal and its progress", "Every AI development plan and its ticked-off actions"]}
          phrase="delete"
          button="Delete goals and plans"
          action={deleteCategoryAction.bind(null, "goals")}
          done="Deleted {count} item(s)."
        />
        <DangerAction
          id="shares"
          title="Delete all share links"
          description={`${counts.shares} link${counts.shares === 1 ? "" : "s"}. Anyone with one of them loses access immediately.`}
          removes={["Every badge, summary and full-report link you've shared"]}
          phrase="delete"
          button="Delete share links"
          action={deleteCategoryAction.bind(null, "shares")}
          done="Deleted {count} link(s)."
        />
        <DangerAction
          id="account"
          title="Delete my account"
          description={`Everything is deleted ${DELETION_GRACE_DAYS} days after you confirm. Signing in again before then cancels it. Your share links and API tokens stop working straight away.`}
          removes={[
            "Your profile and settings",
            "All your 360s, with their responses, reports, pulses and re-runs",
            "Goals, development plans and AI conversations",
            "Coaching links, organization memberships and dashboards",
            "Share links, API tokens and billing history",
          ]}
          phrase={user.email ?? ""}
          phraseHint="To confirm, type your email"
          button="Delete my account"
          action={deleteMyAccountAction}
          redirectTo="/signin?deleted=1"
        />
        <p className="px-5 py-3 text-xs text-muted-foreground">
          To delete a single 360, open it and use the Danger zone at the bottom of its page. Raters&apos; anonymous answers are deleted with your 360s.
        </p>
      </DangerZone>
    </div>
  );
}
