import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Check your email" };

export default function CheckEmail() {
  const devOutbox = process.env.DEV_TOOLS_ENABLED === "true";
  return (
    <div className="mx-auto max-w-sm py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Check your email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>We sent you a sign-in link. It expires in 24 hours.</p>
          {devOutbox && (
            <p>
              No email provider is configured, so the link is in the{" "}
              <Link className="text-primary underline" href="/dev/outbox">
                dev outbox
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
