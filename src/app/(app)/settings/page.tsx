import { aiCatalog } from "@/lib/ai/models";
import { monthlyUsage } from "@/lib/services/ai";
import { requireOnboardedUser } from "@/lib/session";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";
import { NudgeForm } from "./nudge-form";
import { ApiTokens, BenchmarkToggle, DeleteAccountForm } from "./data-forms";
import { listApiTokens } from "@/lib/services/api-tokens";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireOnboardedUser("/settings");
  const usage = await monthlyUsage(user.id);
  const tokens = await listApiTokens(user.id);
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
          <CardDescription>Download everything Mirror stores about you, or delete your account and all of it.</CardDescription>
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
          <DeleteAccountForm email={user.email ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
