import { requireUserId } from "@/lib/session";
import { ConfirmPersonalEmail } from "@/components/settings/personal-email";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Confirm personal email" };

export default async function ConfirmPersonalEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await requireUserId(`/settings/personal-email/${token}`);
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Confirm your personal sign-in email</CardTitle>
        <CardDescription>After this, an email link to that address signs you in to this same account, including your Personal space.</CardDescription>
      </CardHeader>
      <CardContent>
        <ConfirmPersonalEmail token={token} />
      </CardContent>
    </Card>
  );
}
