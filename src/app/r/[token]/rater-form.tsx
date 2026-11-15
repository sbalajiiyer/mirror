"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Questionnaire, type QCompetency, type QDraft } from "@/components/questionnaire/questionnaire";
import { declineAction, previewDeidentifyAction, saveDraftAction, submitRaterAction } from "../actions";

export function RaterForm(props: {
  token: string;
  subjectFirstName: string;
  competencies: QCompetency[];
  scaleMax: number;
  draft: QDraft | null;
  message: string;
  dueAt: string | null;
  managerShownSeparately: boolean;
}) {
  const [declined, setDeclined] = useState(false);
  const n = props.competencies.reduce((s, c) => s + c.questions.length, 0);
  if (declined) return <Alert tone="info">You&apos;ve declined. Thanks for letting {props.subjectFirstName} know.</Alert>;
  return (
    <Questionnaire
      mode="rater"
      subjectFirstName={props.subjectFirstName}
      competencies={props.competencies}
      scaleMax={props.scaleMax}
      initialDraft={props.draft}
      onSaveDraft={(d) => saveDraftAction(props.token, d)}
      onSubmit={(a) => submitRaterAction(props.token, a)}
      onPreviewDeidentify={(texts) => previewDeidentifyAction(props.token, texts)}
      intro={
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">{props.subjectFirstName} would value your feedback</h1>
          <blockquote className="whitespace-pre-line border-l-4 border-primary/40 pl-4 text-muted-foreground">{props.message}</blockquote>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>
              About {Math.max(4, Math.round(n * 0.2 + 3))} minutes · {n} statements · {props.dueAt ? `open until ${new Date(props.dueAt).toLocaleDateString()}` : "no deadline"}
            </li>
            <li>Your progress saves automatically — come back to this link any time.</li>
          </ul>
          {props.managerShownSeparately ? (
            <Alert tone="warning">
              As {props.subjectFirstName}&apos;s manager, your ratings will be shown to them <strong>separately</strong>, so they are not anonymous. Everyone else&apos;s are.
            </Alert>
          ) : (
            <Alert tone="success">
              <ShieldCheck className="mr-1 inline size-4" />
              Anonymous: {props.subjectFirstName} only sees results combined with at least two other people. Your name and email are never linked to your answers.
            </Alert>
          )}
          <button
            className="text-sm text-muted-foreground underline"
            onClick={async () => {
              if (!confirm("Decline this feedback request?")) return;
              const r = await declineAction(props.token);
              if (r.ok) setDeclined(true);
            }}
          >
            I&apos;d rather not give feedback
          </button>
        </div>
      }
    />
  );
}
