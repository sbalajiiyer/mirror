import { revalidatePath } from "next/cache";
import { emailFromUnsubscribeToken, isSuppressed, resubscribe, suppress } from "@/lib/email/unsubscribe";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Email preferences" };
export const dynamic = "force-dynamic";

/** Unsubscribe from all non-essential Mirror emails. The button (not the link) makes the change, so link scanners can't. */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = emailFromUnsubscribeToken(decodeURIComponent(token));
  if (!email) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>This link isn&apos;t valid</CardTitle>
          <CardDescription>Use the unsubscribe link in the most recent email from Mirror, or reply to that email and we&apos;ll remove you.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const off = await isSuppressed(email);
  async function toggle() {
    "use server";
    if (await isSuppressed(email!)) await resubscribe(email!);
    else await suppress(email!, "link");
    revalidatePath(`/u/${token}`);
  }
  return (
    <Card className="mx-auto max-w-lg" data-testid="unsubscribe">
      <CardHeader>
        <CardTitle>{off ? "You're unsubscribed" : "Unsubscribe from Mirror emails"}</CardTitle>
        <CardDescription>
          {off
            ? `We won't send ${email} invitations, reminders, nudges or reports any more. You'll still get sign-in links you ask for.`
            : `Stop all invitations, reminders, nudges and reports to ${email}. Sign-in links you ask for still arrive.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={toggle}>
          <Button type="submit" variant={off ? "outline" : "default"} data-testid="unsubscribe-button">
            {off ? "Subscribe again" : "Unsubscribe"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
