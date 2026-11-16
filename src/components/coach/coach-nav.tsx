import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/coach", label: "Clients", key: "clients" },
  { href: "/coach/analytics", label: "Analytics", key: "analytics" },
  { href: "/coach/settings", label: "Profile & branding", key: "settings" },
] as const;

export function CoachNav({ active, brand }: { active: (typeof TABS)[number]["key"]; brand?: { name: string | null; color: string | null } }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Coach workspace{brand?.name ? ` · ${brand.name}` : ""}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Your coaching practice</h1>
        </div>
        {brand?.color && <span className="h-2 w-24 rounded-full" style={{ background: brand.color }} aria-hidden />}
      </div>
      <nav aria-label="Coach workspace" className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active === t.key ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", active === t.key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
