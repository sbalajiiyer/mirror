import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "overview", label: "Overview", path: "" },
  { key: "people", label: "People", path: "/people" },
  { key: "groups", label: "Teams & cohorts", path: "/groups" },
  { key: "rounds", label: "360 rounds", path: "/rounds" },
  { key: "analytics", label: "Analytics", path: "/analytics" },
  { key: "talent", label: "Talent grid", path: "/talent" },
] as const;

export type OrgTab = (typeof TABS)[number]["key"];

export function OrgNav({ orgId, orgName, active }: { orgId: string; orgName: string; active: OrgTab }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/orgs" className="hover:underline">
            Organizations
          </Link>{" "}
          · admin
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{orgName}</h1>
      </div>
      <nav aria-label="Organization" className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/orgs/${orgId}${t.path}`}
            aria-current={active === t.key ? "page" : undefined}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", active === t.key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
