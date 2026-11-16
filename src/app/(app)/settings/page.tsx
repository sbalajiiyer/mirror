import { aiCatalog } from "@/lib/ai/models";
import { monthlyUsage } from "@/lib/services/ai";
import { requireOnboardedUser } from "@/lib/session";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireOnboardedUser("/settings");
  const usage = await monthlyUsage(user.id);
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
    </div>
  );
}
