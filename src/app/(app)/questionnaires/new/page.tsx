import { requireOnboardedUser } from "@/lib/session";
import { ImportAndBuild } from "@/components/questionnaire-builder/import-and-build";
import { AIGenerator } from "@/components/questionnaire-builder/ai-generator";

import { creditBalance } from "@/lib/services/credits";
export const metadata = { title: "New questionnaire" };

export default async function NewQuestionnairePage({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const user = await requireOnboardedUser("/questionnaires/new");
  const { ai } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{ai ? "Generate a questionnaire with AI" : "Build your questionnaire"}</h1>
      {ai ? <AIGenerator credits={await creditBalance(user.id)} defaultRole={user.profile.jobTitle ?? ""} /> : <ImportAndBuild />}
    </div>
  );
}
