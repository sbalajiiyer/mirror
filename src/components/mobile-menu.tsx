"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Navigation for small screens: a disclosure button that opens a full-width panel under the header. */
export function MobileMenu({ links, email, signOut }: { links: { href: string; label: string }[]; email?: string | null; signOut: React.ReactNode }) {
  const pathname = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenOn((typeof v === "function" ? v(open) : v) ? pathname : null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="xl:hidden">
      <Button ref={button} variant="ghost" size="icon" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)} data-testid="mobile-menu-button" className="size-11">
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="absolute inset-x-0 top-14 z-40 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b bg-background shadow-lg">
          <ul className="mx-auto max-w-6xl px-4 py-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={pathname === l.href || pathname.startsWith(`${l.href}/`) ? "page" : undefined}
                  className="flex min-h-11 items-center rounded-md px-3 text-base hover:bg-accent aria-[current=page]:font-semibold"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 flex items-center justify-between gap-2 border-t px-3 pt-3 pb-1">
              <span className="truncate text-sm text-muted-foreground">{email}</span>
              {signOut}
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
