/** Data deletion (grace period, categories, surveys) and built-in error monitoring. */
import { describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "error").mockImplementation(() => {});

describe.skipIf(!hasDb)("data deletion and monitoring (integration)", async () => {
  const { db } = await import("@/lib/db");
  const my = await import("@/lib/services/my-data");
  const { recordError } = await import("@/lib/monitoring");
  const { surveyCode } = await import("@/lib/survey");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const { CORE_360 } = await import("@/lib/frameworks/core-360");
  const stamp = Date.now();
  const mk = (p: string) => db.user.create({ data: { email: `${p}-${stamp}@test.local`, name: p, profile: { create: { displayName: p, goals: [], onboardedAt: new Date() } } } });
  const fw = await syncFramework(db, CORE_360);

  it("schedules account deletion with a grace period, revokes links at once, and can be cancelled", async () => {
    const u = await mk("grace");
    const a = await db.assessment.create({ data: { subjectId: u.id, frameworkId: fw.id, title: "T", goal: "self_awareness", inviteMessage: "m", minRatersPerGroup: 3 } });
    await db.shareLink.create({ data: { id: `s${stamp}`.padEnd(22, "x").slice(0, 22), userId: u.id, assessmentId: a.id, kind: "BADGE", sections: [] } });
    await expect(my.scheduleAccountDeletion(u.id, "wrong@test.local")).rejects.toThrow(/Type your email/);
    const now = new Date();
    const at = await my.scheduleAccountDeletion(u.id, u.email!.toUpperCase(), now);
    expect(at.getTime() - now.getTime()).toBe(7 * 86400000);
    expect((await db.shareLink.findFirstOrThrow({ where: { userId: u.id } })).revokedAt).not.toBeNull();
    expect((await my.purgeScheduledDeletions(now)).deleted).toBe(0); // not due yet
    expect(await my.cancelAccountDeletion(u.id)).toBe(true);
    expect(await my.recentlyCancelledDeletion(u.id)).toBe(true);
    await my.scheduleAccountDeletion(u.id, u.email!, now);
    expect((await my.purgeScheduledDeletions(new Date(now.getTime() + 8 * 86400000))).deleted).toBeGreaterThanOrEqual(1);
    expect(await db.user.findUnique({ where: { id: u.id } })).toBeNull();
    expect(await db.assessment.findUnique({ where: { id: a.id } })).toBeNull();
  });

  it("deletes a category of data, and a single session or a whole survey", async () => {
    const u = await mk("cat");
    await db.coachChat.create({ data: { userId: u.id, mode: "REPORT", title: "c", tier: "free" } });
    expect(await my.deleteCategory(u.id, "chats")).toBe(1);
    expect(await db.coachChat.count({ where: { userId: u.id } })).toBe(0);

    const base = { subjectId: u.id, frameworkId: fw.id, goal: "self_awareness", inviteMessage: "m", minRatersPerGroup: 3 };
    const root = await db.assessment.create({ data: { ...base, title: "Root", sessionNumber: 1 } });
    const s2 = await db.assessment.create({ data: { ...base, title: "Root · S2", rootAssessmentId: root.id, sessionNumber: 2 } });
    const s3 = await db.assessment.create({ data: { ...base, title: "Root · S3", rootAssessmentId: root.id, sessionNumber: 3 } });
    const other = await mk("other");
    await expect(my.deleteSurveyOrSession(other.id, s2.id, surveyCode(root.id))).rejects.toThrow(/Not found/);
    await expect(my.deleteSurveyOrSession(u.id, s2.id, "MRR-WRONG1")).rejects.toThrow(/survey ID/);
    expect(await my.deleteSurveyOrSession(u.id, s2.id, surveyCode(root.id).toLowerCase())).toEqual({ whole: false, sessions: 1 });
    expect(await db.assessment.findUnique({ where: { id: root.id } })).not.toBeNull();
    expect(await my.deleteSurveyOrSession(u.id, root.id, surveyCode(root.id))).toEqual({ whole: true, sessions: 2 });
    expect(await db.assessment.findUnique({ where: { id: s3.id } })).toBeNull();
  });

  it("groups repeated errors and scrubs personal data", async () => {
    const err = () => {
      const e = new Error(`Lookup failed for jane.doe${stamp}@example.com with token ${"a".repeat(40)}`);
      e.stack = "Error\n    at lookup (/app/x.js:1:1)";
      return e;
    };
    await recordError(err(), { route: `GET /t${stamp}` });
    await recordError(err(), { route: `GET /t${stamp}` });
    const rows = await db.errorEvent.findMany({ where: { route: `GET /t${stamp}` } });
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
    expect(rows[0].message).not.toContain("@example.com");
    expect(rows[0].message).toContain("[email]");
    expect(rows[0].message).toContain("[token]");
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" });
    await recordError(redirect, { route: `GET /r${stamp}` });
    expect(await db.errorEvent.count({ where: { route: `GET /r${stamp}` } })).toBe(0);
  });
});
