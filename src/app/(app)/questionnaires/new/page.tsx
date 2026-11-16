import { requireOnboardedUser } from "@/lib/session";
import { ImportAndBuild } from "@/components/questionnaire-builder/import-and-build";
import { AIGenerator } from "@/components/questionnaire-builder/ai-generator";

export const metadata = { title: "New questionnaire" };

export default async function NewQuestionnairePage({ searchParams }: { searchParams: Promise<{ ai?: string }> }) {
  const user = await requireOnboardedUser("/questionnaires/new");
  const { ai } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{ai ? "Generate a questionnaire with AI" : "Build your questionnaire"}</h1>
      {ai ? <AIGenerator credits={user.profile.aiCredits} defaultRole={user.profile.jobTitle ?? ""} /> : <ImportAndBuild />}
    </div>
  );
}
