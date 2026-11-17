"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, User } from "lucide-react";
import { switchWorkspaceAction } from "@/app/(app)/workspace/actions";

const MANAGE = "__manage";

export type SwitcherWorkspace = { key: string; name: string; kind: "PERSONAL" | "COMPANY" };

/** Header control to move between the Personal space and company workspaces. */
export function WorkspaceSwitcher({ workspaces, active, className = "" }: { workspaces: SwitcherWorkspace[]; active: string; className?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const current = workspaces.find((w) => w.key === active) ?? workspaces[0];
  const Icon = current.kind === "PERSONAL" ? User : Building2;
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">Workspace</span>
      <Icon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
      <select
        data-testid="workspace-switcher"
        value={current.key}
        disabled={pending}
        onChange={(e) => {
          const key = e.target.value;
          if (key === MANAGE) return router.push("/orgs");
          start(() => switchWorkspaceAction(key));
        }}
        className="h-9 max-w-[12rem] truncate rounded-md border border-input bg-background pr-7 pl-8 text-sm font-medium"
      >
        {workspaces.map((w) => (
          <option key={w.key} value={w.key}>
            {w.name}
          </option>
        ))}
        <option value={MANAGE}>Companies…</option>
      </select>
    </label>
  );
}
