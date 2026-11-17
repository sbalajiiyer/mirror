import { liveSessionUserId } from "@/lib/session";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { demoLoginEnabled, googleEnabled, signIn } from "@/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientIp, hit } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/email-address";
import { ssoRequiredFor } from "@/lib/services/sso";
import Link from "next/link";

export const metadata = { title: "Sign in" };

function safeCallback(url: string | undefined) {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/dashboard";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string; stale?: string }> }) {
  const { callbackUrl, error, stale } = await searchParams;
  const redirectTo = safeCallback(callbackUrl);
  if (await liveSessionUserId()) redirect(redirectTo);

  async function emailSignIn(formData: FormData) {
    "use server";
    const email = normalizeEmail(String(formData.get("email") ?? ""));
    if (!email) redirect("/signin?error=email");
    const [byIp, byEmail] = await Promise.all([hit("magicLinkIp", await clientIp()), hit("magicLinkEmail", email)]);
    if (!byIp.ok || !byEmail.ok) redirect("/signin?error=rate");
    // Organizations that require SSO: go straight to their identity provider.
    if (await ssoRequiredFor(email)) redirect(`/api/sso/start?email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(redirectTo)}`);
    try {
      await signIn("email", { email, redirectTo });
    } catch (e) {
      if (e instanceof AuthError) redirect(`/signin?error=${e.type}`);
      throw e;
    }
  }

  return (
    <div className="mx-auto max-w-sm py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Sign in to Mirror</CardTitle>
          <CardDescription>We&apos;ll email you a magic link — no password needed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stale && !error && <Alert tone="info">Your session has ended. Please sign in again.</Alert>}
          {error && <Alert tone="error">{error === "email"
                ? "Please enter a valid email address."
                : error === "rate"
                  ? "Too many sign-in attempts. Please wait a few minutes and try again."
                  : "Sign-in failed. Please try again."}</Alert>}
          <form action={emailSignIn} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
            </div>
            <Button type="submit" className="w-full">
              Email me a sign-in link
            </Button>
          </form>
          <p className="text-center text-sm">
            <Link href={`/signin/sso${callbackUrl ? `?callbackUrl=${encodeURIComponent(redirectTo)}` : ""}`} className="underline" data-testid="sso-link">
              Sign in with company SSO
            </Link>
          </p>
          {googleEnabled && (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo });
              }}
            >
              <Button type="submit" variant="outline" className="w-full">
                Continue with Google
              </Button>
            </form>
          )}
          {demoLoginEnabled && (
            <form
              action={async () => {
                "use server";
                if (!(await hit("demoLoginIp", await clientIp())).ok) redirect("/signin?error=rate");
                await signIn("demo", { redirectTo });
              }}
              className="border-t pt-4"
            >
              <Button type="submit" variant="secondary" className="w-full" data-testid="demo-login">
                Sign in as demo user (Alex)
              </Button>
              <Button
                type="submit"
                variant="outline"
                className="mt-2 w-full"
                data-testid="demo-coach-login"
                formAction={async () => {
                  "use server";
                  if (!(await hit("demoLoginIp", await clientIp())).ok) redirect("/signin?error=rate");
                  await signIn("demo-coach", { redirectTo: "/coach" });
                }}
              >
                Sign in as demo coach (Jordan)
              </Button>
              <Button
                type="submit"
                variant="outline"
                className="mt-2 w-full"
                data-testid="demo-admin-login"
                formAction={async () => {
                  "use server";
                  if (!(await hit("demoLoginIp", await clientIp())).ok) redirect("/signin?error=rate");
                  await signIn("demo-admin", { redirectTo: "/orgs" });
                }}
              >
                Sign in as demo org admin (Morgan)
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">Explore with sample data. The demo account is shared and resets regularly.</p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
