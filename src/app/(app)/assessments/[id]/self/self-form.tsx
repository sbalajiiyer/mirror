"use client";

import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Questionnaire, type QCompetency } from "@/components/questionnaire/questionnaire";
import { submitSelfAction } from "../../actions";

export function SelfForm({ assessmentId, competencies, scaleMax }: { assessmentId: string; competencies: QCompetency[]; scaleMax: number }) {
  const router = useRouter();
  return (
    <Questionnaire
      mode="self"
      subjectFirstName="you"
      competencies={competencies}
      scaleMax={scaleMax}
      onSubmit={(a) => submitSelfAction(assessmentId, a)}
      onDone={() => setTimeout(() => router.push(`/assessments/${assessmentId}`), 1200)}
      intro={
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">Rate yourself first</h1>
          <p className="text-muted-foreground">
            Answer the same statements your raters will see, as honestly as you can. Your report compares your view with theirs — the gaps are where the insight is.
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4" /> Your answers are locked once submitted, before anyone else responds.
          </p>
        </div>
      }
    />
  );
}
