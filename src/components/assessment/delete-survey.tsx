import { db } from "@/lib/db";
import { surveyCode } from "@/lib/survey";
import { DangerAction, DangerZone } from "@/components/danger-zone";
import { deleteSurveyAction } from "@/app/(app)/assessments/actions";

/** Danger zone for one 360: the first session deletes the whole survey, later sessions just themselves. */
export async function DeleteSurvey({ assessmentId }: { assessmentId: string }) {
  const a = await db.assessment.findUniqueOrThrow({ where: { id: assessmentId }, select: { id: true, rootAssessmentId: true, sessionNumber: true, title: true } });
  const rootId = a.rootAssessmentId ?? a.id;
  const whole = !a.rootAssessmentId;
  const sessions = whole ? await db.assessment.count({ where: { OR: [{ id: a.id }, { rootAssessmentId: a.id }] } }) : 1;
  return (
    <div className="no-print mt-8">
      <DangerZone>
        <DangerAction
          id="survey"
          title={whole ? "Delete this survey" : `Delete session ${a.sessionNumber}`}
          description={
            whole
              ? `Deletes “${a.title}”${sessions > 1 ? ` and all ${sessions} of its sessions (pulses and re-runs)` : ""}.`
              : `Deletes only this session. Earlier and later sessions of the survey stay.`
          }
          removes={["Raters' anonymous answers and comments", "Reports, AI summaries and themes", "Development plans and goals linked to it", "Share links, invitations and translations"]}
          phrase={surveyCode(rootId)}
          phraseHint="To confirm, type the survey ID"
          button={whole ? "Delete survey" : "Delete session"}
          action={deleteSurveyAction.bind(null, a.id)}
          redirectTo="/dashboard?deleted=1"
        />
      </DangerZone>
    </div>
  );
}
