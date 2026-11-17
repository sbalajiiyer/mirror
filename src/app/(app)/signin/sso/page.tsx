import { liveSessionUserId } from "@/lib/session";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Sign in with SSO" };

const MESSAGES: Record<string, string> = {
  required: "Your organization requires single sign-on. Continue with your work email below.",
  no_sso: "Single sign-on isn't set up for that email domain. Use an email link instead.",
  rate: "Too many sign-in attempts. Please wait a few minutes and try again.",
  start: "We couldn't reach your identity provider. Please try again, or ask your admin to check the SSO settings.",
  failed: "Single sign-on didn't complete. Please try again.",
};

export default async function SsoSignInPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; email?: string; callbackUrl?: string }> }) {
  const sp = await searchParams;
  if (await liveSessionUserId()) redirect("/dashboard");
  const error = sp.error ? (sp.error === "failed" && sp.message ? sp.message.slice(0, 200) : (MESSAGES[sp.error] ?? MESSAGES.failed)) : null;
  return (
    <div className="mx-auto max-w-sm py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Sign in with company SSO</CardTitle>
          <CardDescription>Enter your work email and we&apos;ll send you to your organization&apos;s sign-in page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <Alert tone={sp.error === "required" ? "info" : "error"}>{error}</Alert>}
          <form action="/api/sso/start" method="get" className="space-y-3">
            {sp.callbackUrl && <input type="hidden" name="callbackUrl" value={sp.callbackUrl} />}
            <div className="space-y-1.5">
              <Label htmlFor="sso-email">Work email</Label>
              <Input id="sso-email" name="email" type="email" autoComplete="email" required defaultValue={sp.email ?? ""} placeholder="you@company.com" />
            </div>
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
          <p className="text-center text-sm">
            <Link href="/signin" className="underline">
              Back to other sign-in options
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
