import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dev outbox", robots: { index: false } };

/** Local stand-in for an inbox while no email provider is configured. DEV_TOOLS_ENABLED only. */
export default async function Outbox() {
  if (process.env.DEV_TOOLS_ENABLED !== "true") notFound();
  const mails = await db.notification.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const linkify = (t: string) =>
    t.split(/(https?:\/\/\S+)/g).map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a key={i} href={part} className="break-all text-primary underline">
          {part}
        </a>
      ) : (
        part
      ),
    );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dev outbox</h1>
      <p className="text-sm text-muted-foreground">Emails &quot;sent&quot; by the console provider. Never enable on a public deployment.</p>
      {mails.map((m) => (
        <Card key={m.id} data-testid="outbox-mail">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {m.subject} <span className="font-normal text-muted-foreground">→ {m.to}</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {m.template} · {m.status} · {m.createdAt.toLocaleString()}
              {m.fromName && ` · from ${m.fromName}`}
              {m.replyTo && ` · reply-to ${m.replyTo}`}
            </p>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap font-sans text-sm">{linkify(m.body)}</pre>
          </CardContent>
        </Card>
      ))}
      {mails.length === 0 && <p className="text-muted-foreground">No emails yet.</p>}
    </div>
  );
}
