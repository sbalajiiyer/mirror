"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { syncWorkspaceAction } from "@/app/(app)/workspace/actions";

/** Opening a company's pages makes that company the active workspace, so the header matches. */
export function SyncWorkspace({ target, current }: { target: string; current: string }) {
  const router = useRouter();
  useEffect(() => {
    if (target === current) return;
    syncWorkspaceAction(target).then(() => router.refresh());
  }, [target, current, router]);
  return null;
}
