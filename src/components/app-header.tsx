import Link from "next/link";
import { auth, signOut } from "@/auth";
import { liveSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { MobileMenu } from "@/components/mobile-menu";
import { ThemeToggle } from "@/components/theme-toggle";

export async function AppHeader() {
  const uid = await liveSessionUserId();
  const session = uid ? await auth() : null;
  const isCoach = uid ? !!(await db.coachProfile.findUnique({ where: { userId: uid }, select: { userId: true } })) : false;
  const inOrg = uid ? (await db.orgMember.count({ where: { userId: uid, status: "ACTIVE" } })) > 0 : false;
  const links = [
    { href: "/dashboard", label: "My 360s" },
    { href: "/progress", label: "Progress" },
    { href: "/questionnaires", label: "Questionnaires" },
    { href: "/dashboards", label: "Dashboards" },
    { href: "/chat", label: "AI coach" },
    { href: isCoach ? "/coach" : "/coaching", label: isCoach ? "Coach" : "Coaching" },
    ...(inOrg ? [{ href: "/orgs", label: "Organizations" }] : []),
    { href: "/billing", label: "Billing" },
    { href: "/settings", label: "Settings" },
  ];
  const signOutForm = (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <Button variant="ghost" size="sm" type="submit" className="min-h-11 xl:min-h-0">
        Sign out
      </Button>
    </form>
  );
  return (
    <header className="no-print sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href={session ? "/dashboard" : "/"} aria-label="Mirror home">
          <Logo />
        </Link>
        {session ? (
          <>
            <nav aria-label="Main" className="hidden items-center gap-1 text-sm xl:flex">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-md px-2.5 py-2 hover:bg-accent">
                  {l.label}
                </Link>
              ))}
              <ThemeToggle />
              {signOutForm}
            </nav>
            <div className="flex items-center gap-1 xl:hidden">
              <ThemeToggle className="size-11" />
              <MobileMenu links={links} email={session.user.email} signOut={signOutForm} />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button asChild size="sm">
              <Link href="/signin">Sign in</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
