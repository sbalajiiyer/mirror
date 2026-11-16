import { DEFAULT_INVITE_MESSAGE } from "@/lib/constants";
import { requireOnboardedUser } from "@/lib/session";
import { notFound, redirect } from "next/navigation";
import { frameworksForUser, frameworkView } from "@/lib/services/frameworks";
import { campaignContext } from "@/lib/services/org";
import { Wizard } from "./wizard";

export const metadata = { title: "New 360" };

export default async function NewAssessmentPage({ searchParams }: { searchParams: Promise<{ framework?: string; campaign?: string }> }) {
  const { framework, campaign: campaignId } = await searchParams;
  const user = await requireOnboardedUser(`/assessments/new${campaignId ? `?campaign=${campaignId}` : ""}`);
  let frameworks = await frameworksForUser(user.id);
  let campaign: Awaited<ReturnType<typeof campaignContext>> | null = null;
  if (campaignId) {
    try {
      campaign = await campaignContext(user.id, campaignId);
    } catch {
      notFound();
    }
    if (campaign.existingAssessmentId) redirect(`/assessments/${campaign.existingAssessmentId}`);
    // The organization fixes the questionnaire for its 360 round.
    const fw = await frameworkView(campaign.frameworkId);
    frameworks = [fw];
  }
  const first = user.profile.displayName.split(" ")[0];
  return (
    <Wizard
      frameworks={frameworks}
      initialFrameworkId={campaign?.frameworkId ?? framework}
      campaign={campaign}
      defaultGoal={(user.profile.goals[0] as string) ?? "self_awareness"}
      defaultMessage={DEFAULT_INVITE_MESSAGE(first)}
      subjectFirstName={first}
    />
  );
}
