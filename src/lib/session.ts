import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

/**
 * The signed-in user's id, only if that user still exists. A session can outlive its user (account
 * deleted, demo data re-seeded); treating it as signed in would bounce between /signin and the app.
 */
export async function liveSessionUserId(): Promise<string | null> {
  const id = (await auth())?.user?.id;
  if (!id) return null;
  // Scheduled for deletion counts as signed out everywhere; signing in again cancels the deletion.
  const u = await db.user.findUnique({ where: { id }, select: { deletionScheduledAt: true } });
  return u && !u.deletionScheduledAt ? id : null;
}

/**
 * Current user id or redirect to sign-in. Use in server components and server actions.
 * Age gate: people who haven't passed the age check yet are sent to /welcome first.
 */
export async function requireUserId(callbackUrl?: string): Promise<string> {
  const id = await requireSignedIn(callbackUrl);
  const u = await db.user.findUnique({ where: { id }, select: { ageConfirmedAt: true } });
  if (!u?.ageConfirmedAt) redirect(`/welcome${callbackUrl ? `?next=${encodeURIComponent(callbackUrl)}` : ""}`);
  return id;
}

/** Signed in, without the age check. Only for the age check itself (/welcome). */
export async function requireSignedIn(callbackUrl?: string): Promise<string> {
  const id = await liveSessionUserId();
  if (!id) redirect(`/signin${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`);
  return id;
}

/** Current user + profile; sends users without a finished profile to onboarding. */
export async function requireOnboardedUser(callbackUrl?: string) {
  const id = await requireUserId(callbackUrl);
  const user = await db.user.findUnique({ where: { id }, include: { profile: true } });
  if (!user) redirect(`/signin?stale=1${callbackUrl ? `&callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`);
  if (!user.profile?.onboardedAt) redirect("/onboarding");
  return { ...user, profile: user.profile };
}

/** Load an assessment owned by the current user, or 404. Ownership is always checked server-side. */
export async function requireOwnedAssessment(assessmentId: string) {
  const userId = await requireUserId();
  const a = await db.assessment.findFirst({ where: { id: assessmentId, subjectId: userId } });
  if (!a) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return { userId, assessment: a! };
}
