import Link from "next/link";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { CoachOnboardingForm } from "./coach-onboarding-form";

export const metadata = { title: "Set up your coaching practice" };

export default async function CoachOnboardingPage() {
  const userId = await requireUserId("/onboarding/coach");
  const user = await db.user.findUnique({ where: { id: userId }, include: { profile: true, coachProfile: true } });
  const c = user?.coachProfile;
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your coaching practice</h1>
      <p className="mt-1 text-muted-foreground">
        Your clients choose what to share with you: reports, goals, plans. You can add branding and a marketplace listing later in your coach settings.
      </p>
      <CoachOnboardingForm
        initial={{ displayName: c?.displayName ?? user?.profile?.displayName ?? user?.name ?? "", brandName: c?.brandName ?? "", website: c?.website ?? "", clientsFocus: c?.headline ?? "" }}
      />
      <p className="mt-6 text-sm text-muted-foreground">
        Want feedback on yourself too? You can run your own 360 any time. <Link href="/onboarding?personal=1" className="underline">Set up a personal profile instead</Link>.
      </p>
    </div>
  );
}
