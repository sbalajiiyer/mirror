import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { activeWorkspace } from "@/lib/workspace";
import { getCoachProfile } from "@/lib/services/coach";
import { listDashboards } from "@/lib/services/dashboards";
import { CreateDashboardForm } from "@/components/dashboards/dashboard-controls";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Dashboards" };
const SCOPE = {
  PERSONAL: "My data",
  COACH: "Coaching",
  ORG: "Organization",
} as const;

export default async function DashboardsPage() {
  const user = await requireOnboardedUser("/dashboards");
  const ws = await activeWorkspace(user.id);
  const list = await listDashboards(user.id, ws.id);
  // Personal: my feedback and coaching. Company: that company's dashboards (admins only).
  const coach = ws.kind === "PERSONAL" ? await getCoachProfile(user.id) : null;
  const adminOrgs =
    ws.kind === "COMPANY"
      ? await db.orgMember.findMany({
          where: {
            userId: user.id,
            orgId: ws.orgId!,
            role: { in: ["ANALYST", "ADMIN", "OWNER"] },
            status: "ACTIVE",
          },
          include: { org: true },
        })
      : [];
  const orgNames = new Map(adminOrgs.map((m) => [m.orgId, m.org.name]));
  const scopes = [
    ...(ws.kind === "PERSONAL"
      ? [
          {
            value: "PERSONAL",
            label: "My own feedback",
            scope: "PERSONAL" as const,
          },
        ]
      : []),
    ...(coach
      ? [
          {
            value: "COACH",
            label: "My coaching clients",
            scope: "COACH" as const,
          },
        ]
      : []),
    ...adminOrgs.map((m) => ({
      value: `ORG:${m.orgId}`,
      label: `Organization: ${m.org.name}`,
      scope: "ORG" as const,
      orgId: m.orgId,
    })),
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboards</h1>
        <p className="text-muted-foreground">
          Build your own views, ask questions in plain English, export CSV, or
          get them by email.
        </p>
      </div>
      {scopes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New dashboard</CardTitle>
            <CardDescription>
              Widgets show only what you can already see elsewhere in Mirror,
              with the same privacy rules.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateDashboardForm scopes={scopes} />
          </CardContent>
        </Card>
      )}
      {list.length > 0 && (
        <ul className="divide-y rounded-lg border" data-testid="dashboard-list">
          {list.map((d) => (
            <li key={d.id}>
              <Link
                href={`/dashboards/${d.id}`}
                className="flex items-center justify-between gap-2 px-3 py-3 text-sm hover:bg-accent/50"
              >
                <span className="flex items-center gap-2 font-medium">
                  <LayoutDashboard
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />{" "}
                  {d.name}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">
                    {d.scope === "ORG"
                      ? (orgNames.get(d.orgId ?? "") ?? "Organization")
                      : SCOPE[d.scope]}
                  </Badge>
                  {d.schedule && (
                    <Badge variant="outline">Emailed {d.schedule}</Badge>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
