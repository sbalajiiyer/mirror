import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { personalActivity } from "@/lib/services/activity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Activity" };

export default async function ActivityPage() {
  const user = await requireOnboardedUser("/settings/activity");
  const rows = await personalActivity(user.id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Settings
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Activity on your data</h1>
        <p className="text-muted-foreground">Sign-ins, and every time a coach, an organization admin or a share-link visitor opened something of yours.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <CardDescription>The latest 100 events. If something looks wrong, end the coaching link or revoke the share link, and contact support.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="divide-y text-sm" data-testid="activity-list">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <strong className="font-medium">{r.actor}</strong> · {r.label}
                    {r.method && <span className="text-muted-foreground"> ({r.method === "email" ? "email link" : r.method})</span>}
                  </span>
                  <time className="text-muted-foreground" dateTime={r.at.toISOString()}>
                    {r.at.toISOString().slice(0, 16).replace("T", " ")} UTC
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
