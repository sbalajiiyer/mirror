"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Questionnaire, type QCompetency, type QDraft } from "@/components/questionnaire/questionnaire";
import { raterStrings, type RaterLocale } from "@/lib/i18n/rater";
import { declineAction, previewDeidentifyAction, saveDraftAction, submitRaterAction } from "../actions";

export function RaterForm(props: {
  token: string;
  locale: RaterLocale;
  subjectFirstName: string;
  competencies: QCompetency[];
  scaleMax: number;
  draft: QDraft | null;
  message: string;
  dueAt: string | null;
  machineTranslated: boolean;
}) {
  const t = raterStrings(props.locale);
  const name = props.subjectFirstName;
  const [declined, setDeclined] = useState(false);
  const n = props.competencies.reduce((s, c) => s + c.questions.length, 0);
  if (declined) return <Alert tone="info">{t.declined(name)}</Alert>;
  return (
    <Questionnaire
      mode="rater"
      strings={t}
      subjectFirstName={name}
      competencies={props.competencies}
      scaleMax={props.scaleMax}
      initialDraft={props.draft}
      onSaveDraft={(d) => saveDraftAction(props.token, d)}
      onSubmit={(a) => submitRaterAction(props.token, a)}
      onPreviewDeidentify={(texts) => previewDeidentifyAction(props.token, texts)}
      intro={
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">{t.wouldValue(name)}</h1>
          <blockquote className="whitespace-pre-line border-l-4 border-primary/40 pl-4 text-muted-foreground">{props.message}</blockquote>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>
              {t.minutes(Math.max(4, Math.round(n * 0.2 + 3)))} · {t.statements(n)} · {props.dueAt ? t.openUntil(new Date(props.dueAt).toLocaleDateString(props.locale)) : t.noDeadline}
            </li>
            <li>{t.autosave}</li>
          </ul>
          {props.machineTranslated && t.translatedNote && <p className="text-xs text-muted-foreground">{t.translatedNote}</p>}
          <Alert tone="success" data-testid="rater-anonymity">
            <ShieldCheck className="mr-1 inline size-4" />
            {t.anonymous(name)}
          </Alert>
          <button
            className="text-sm text-muted-foreground underline"
            onClick={async () => {
              if (!confirm(t.declineConfirm)) return;
              const r = await declineAction(props.token);
              if (r.ok) setDeclined(true);
            }}
          >
            {t.decline}
          </button>
        </div>
      }
    />
  );
}
