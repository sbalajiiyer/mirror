import Link from "next/link";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/funnel", label: "Funnel" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/errors", label: "Errors" },
] as const;

/** Links between the platform admin pages. */
export function AdminNav({ active }: { active: (typeof LINKS)[number]["label"] }) {
  return (
    <nav aria-label="Admin" className="flex flex-wrap gap-2 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.label === active ? "page" : undefined}
          className={cn("rounded-md border px-3 py-1.5 hover:bg-accent", l.label === active && "border-primary bg-accent font-medium")}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
