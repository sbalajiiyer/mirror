import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { getReportForOwner } from "@/lib/services/reports";
import { seriesRootId } from "@/lib/services/pulses";

/** Create a goal on a competency from a closed report; baseline = others' average there. */
export async function createGoal(userId: string, assessmentId: string, competencyKey: string, target?: number) {
  const r = await getReportForOwner(userId, assessmentId);
  if (r.status !== "ok" || !r.report.anonymity.available) throw new DomainError("Goals need a report with results.");
  const comp = r.report.competencies.find((c) => c.key === competencyKey);
  if (!comp) throw new DomainError("Unknown competency");
  const a = await db.assessment.findUniqueOrThrow({ where: { id: assessmentId } });
  const rootId = seriesRootId(a);
  const scale = r.report.assessment.scaleMax;
  const baseline = comp.others.mean;
  const t = target ?? Math.min(scale, Math.round(((baseline ?? 3) + 0.5) * 10) / 10);
  if (t < 1 || t > scale) throw new DomainError(`Target must be between 1 and ${scale}`);
  const existing = await db.goal.findFirst({ where: { userId, assessmentId: rootId, competencyKey, status: "ACTIVE" } });
  if (existing) throw new DomainError(`You already have an active goal for ${comp.name}.`);
  const goal = await db.goal.create({
    data: { userId, assessmentId: rootId, competencyKey, competencyName: comp.name, title: `Raise ${comp.name.toLowerCase()} to ${t.toFixed(1)}`, baseline, target: t },
  });
  await audit(userId, "goal.create", "Goal", goal.id);
  return goal;
}

export async function updateGoalTarget(userId: string, goalId: string, target: number) {
  const g = await db.goal.findFirst({ where: { id: goalId, userId } });
  if (!g) throw new DomainError("Not found", "not_found");
  if (!(target >= 1 && target <= 10)) throw new DomainError("Invalid target");
  await db.goal.update({ where: { id: g.id }, data: { target, title: `Raise ${g.competencyName.toLowerCase()} to ${target.toFixed(1)}`, status: "ACTIVE", achievedAt: null } });
}

export async function archiveGoal(userId: string, goalId: string) {
  const g = await db.goal.findFirst({ where: { id: goalId, userId } });
  if (!g) throw new DomainError("Not found", "not_found");
  await db.goal.update({ where: { id: g.id }, data: { status: "ARCHIVED" } });
}

/** Mark goals achieved when a later measurement reaches the target (idempotent). */
export async function markAchieved(goalId: string, at: Date) {
  await db.goal.updateMany({ where: { id: goalId, status: "ACTIVE" }, data: { status: "ACHIEVED", achievedAt: at } });
}
