import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const userId = await requireUserId("/onboarding");
  const user = await db.user.findUnique({ where: { id: userId }, include: { profile: true } });
  const p = user?.profile;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to Mirror</h1>
      <p className="mt-1 text-muted-foreground">A few details so your 360 and report fit what you&apos;re working towards.</p>
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
