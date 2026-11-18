import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSignedIn } from "@/lib/session";
import { AGE_BLOCK_COOKIE } from "@/lib/age";
import { AgeBlocked, AgeCheckForm } from "./age-check-form";

export const metadata = { title: "Welcome" };

/** Age check and terms, before anything else (the age gate). */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if ((await cookies()).get(AGE_BLOCK_COOKIE)?.value === "blocked") return <AgeBlocked />;
  const userId = await requireSignedIn("/welcome");
  const u = await db.user.findUnique({ where: { id: userId }, select: { ageConfirmedAt: true } });
  if (u?.ageConfirmedAt) redirect(safeNext);
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to Mirror</h1>
      <p className="mt-1 text-muted-foreground">Before you start, two quick things.</p>
      <AgeCheckForm next={safeNext} />
    </div>
  );
}
