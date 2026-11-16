import { DEFAULT_INVITE_MESSAGE } from "@/lib/constants";
import { requireOnboardedUser } from "@/lib/session";
import { frameworksForUser } from "@/lib/services/frameworks";
import { Wizard } from "./wizard";

export const metadata = { title: "New 360" };

export default async function NewAssessmentPage({ searchParams }: { searchParams: Promise<{ framework?: string }> }) {
  const user = await requireOnboardedUser("/assessments/new");
  const { framework } = await searchParams;
  const frameworks = await frameworksForUser(user.id);
  const first = user.profile.displayName.split(" ")[0];
  return (
    <Wizard
      frameworks={frameworks}
      initialFrameworkId={framework}
      defaultGoal={(user.profile.goals[0] as string) ?? "self_awareness"}
      defaultMessage={DEFAULT_INVITE_MESSAGE(first)}
      subjectFirstName={first}
    />
  );
}
