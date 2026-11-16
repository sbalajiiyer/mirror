import Link from "next/link";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export async function AppHeader() {
  const session = await auth();
  const uid = session?.user?.id;
  const isCoach = uid ? !!(await db.coachProfile.findUnique({ where: { userId: uid }, select: { userId: true } })) : false;
  const inOrg = uid ? (await db.orgMember.count({ where: { userId: uid, status: "ACTIVE" } })) > 0 : false;
  return (
    <header className="no-print sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href={session ? "/dashboard" : "/"} aria-label="Mirror home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {session ? (
            <>
              <Link href="/dashboard" className="hidden rounded-md px-3 py-2 hover:bg-accent sm:block">
                My 360s
              </Link>
              <Link href="/progress" className="hidden rounded-md px-3 py-2 hover:bg-accent sm:block">
                Progress
              </Link>
              <Link href="/questionnaires" className="hidden rounded-md px-3 py-2 hover:bg-accent md:block">
                Questionnaires
              </Link>
              <Link href={isCoach ? "/coach" : "/coaching"} className="hidden rounded-md px-3 py-2 hover:bg-accent md:block">
                {isCoach ? "Coach" : "Coaching"}
              </Link>
              {inOrg && (
                <Link href="/orgs" className="hidden rounded-md px-3 py-2 hover:bg-accent md:block">
                  Organizations
                </Link>
              )}
              <Link href="/settings" className="hidden rounded-md px-3 py-2 hover:bg-accent sm:block">
                Settings
              </Link>
              <span className="hidden max-w-48 truncate text-muted-foreground lg:block">{session.user.email}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <Button variant="ghost" size="sm" type="submit">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/signin">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
