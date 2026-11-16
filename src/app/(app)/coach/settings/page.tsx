import { redirect } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getCoachProfile } from "@/lib/services/coach";
import { CoachNav } from "@/components/coach/coach-nav";
import { CoachProfileForm } from "@/components/coach/coach-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Coach profile" };

export default async function CoachSettings() {
  const user = await requireOnboardedUser("/coach/settings");
  const p = await getCoachProfile(user.id);
  if (!p) redirect("/coach");
  return (
    <div className="space-y-6">
      <CoachNav active="settings" brand={{ name: p.brandName, color: p.brandColor }} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile & branding</CardTitle>
          <CardDescription>Questionnaires you build under Questionnaires are available to your active clients when they set up a 360.</CardDescription>
        </CardHeader>
        <CardContent>
          <CoachProfileForm initial={{ displayName: p.displayName, brandName: p.brandName ?? "", brandColor: p.brandColor ?? "", website: p.website ?? "" }} />
        </CardContent>
      </Card>
    </div>
  );
}
