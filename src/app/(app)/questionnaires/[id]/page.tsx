import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getOwnFramework } from "@/lib/services/frameworks";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { QuestionnaireBuilder } from "@/components/questionnaire-builder/builder";

export const metadata = { title: "Questionnaire" };

export default async function EditQuestionnairePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ generated?: string; saved?: string }> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  const sp = await searchParams;
  const fw = await getOwnFramework(user.id, id).catch(() => null);
  if (!fw) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/questionnaires" className="text-sm text-muted-foreground hover:underline">
            ← Questionnaires
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{fw.name}</h1>
        </div>
        <Button asChild>
          <Link href={`/assessments/new?framework=${fw.id}`}>Use in a new 360</Link>
        </Button>
      </div>
      {sp.generated && (
        <Alert tone="success" data-testid="generated-alert">
          Your questionnaire is ready and saved. Review the wording below — editing is free.
        </Alert>
      )}
      {sp.saved && <Alert tone="success">Saved.</Alert>}
      <QuestionnaireBuilder
        id={fw.id}
        initial={{
          name: fw.name,
          description: fw.description,
          competencies: fw.competencies.map((c) => ({ name: c.name, description: c.description, questions: c.questions.map((q) => ({ text: q.text, selfText: q.selfText, selfEdited: true })) })),
        }}
      />
    </div>
  );
}
