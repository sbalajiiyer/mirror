import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

/** Current user id or redirect to sign-in. Use in server components and server actions. */
export async function requireUserId(callbackUrl?: string): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect(`/signin${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`);
  return id;
}

/** Current user + profile; sends users without a finished profile to onboarding. */
export async function requireOnboardedUser(callbackUrl?: string) {
  const id = await requireUserId(callbackUrl);
  const user = await db.user.findUnique({ where: { id }, include: { profile: true } });
  if (!user) redirect("/signin");
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
