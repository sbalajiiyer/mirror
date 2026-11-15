import { db } from "@/lib/db";
import { CORE_360 } from "@/lib/frameworks/core-360";
import { syncFramework } from "@/lib/frameworks/sync";
import { DEFAULT_INVITE_MESSAGE } from "@/lib/constants";
import { requireOnboardedUser } from "@/lib/session";
import { Wizard, type WizardFramework } from "./wizard";

export const metadata = { title: "New 360" };

export default async function NewAssessmentPage() {
  const user = await requireOnboardedUser("/assessments/new");
  const fw = await syncFramework(db, CORE_360);
  const full = await db.framework.findUniqueOrThrow({
    where: { id: fw.id },
    include: { competencies: { orderBy: { order: "asc" }, include: { questions: { orderBy: { order: "asc" } } } } },
  });
  const framework: WizardFramework = {
    id: full.id,
    name: full.name,
    description: full.description,
    version: full.version,
    competencies: full.competencies.map((c) => ({
      key: c.key,
      name: c.name,
      description: c.description,
      questions: c.questions.map((q) => ({ key: q.key, text: q.text, selfText: q.selfText })),
    })),
  };
  const first = user.profile.displayName.split(" ")[0];
  return (
    <Wizard
      framework={framework}
      defaultGoal={(user.profile.goals[0] as string) ?? "self_awareness"}
      defaultMessage={DEFAULT_INVITE_MESSAGE(first)}
      subjectFirstName={first}
    />
  );
}
