import Link from "next/link";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export async function AppHeader() {
  const session = await auth();
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
              <Link href="/settings" className="hidden rounded-md px-3 py-2 hover:bg-accent sm:block">
                Settings
              </Link>
              <span className="hidden max-w-48 truncate text-muted-foreground md:block">{session.user.email}</span>
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
