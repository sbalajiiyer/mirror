import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ personal?: string }> }) {
  const userId = await requireUserId("/onboarding");
  const user = await db.user.findUnique({ where: { id: userId }, include: { profile: true, coachProfile: true } });
  const p = user?.profile;
  // Someone who became a coach by accepting a client's invitation gets the coach onboarding.
  if (user?.coachProfile && !p?.onboardedAt && !(await searchParams).personal) redirect("/onboarding/coach");
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to Mirror</h1>
      <p className="mt-1 text-muted-foreground">A few details so your 360 and report fit what you&apos;re working towards.</p>
      <p className="mt-2 text-sm">
        Are you a coach?{" "}
        <Link href="/onboarding/coach" className="underline" data-testid="coach-onboarding-link">
          Set up your coaching practice instead
        </Link>
      </p>
      <OnboardingForm
        initial={{
          displayName: p?.displayName ?? user?.name ?? "",
          jobTitle: p?.jobTitle ?? "",
          seniority: p?.seniority ?? "",
          industry: p?.industry ?? "",
          goals: (p?.goals as string[]) ?? [],
          feedbackTone: (p?.feedbackTone as "direct" | "balanced" | "gentle") ?? "balanced",
        }}
      />
    </div>
  );
}
