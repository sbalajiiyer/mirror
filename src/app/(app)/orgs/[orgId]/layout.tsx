import { requireUserId } from "@/lib/session";
import { activeWorkspace, listWorkspaces } from "@/lib/workspace";
import { SyncWorkspace } from "@/components/sync-workspace";

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const userId = await requireUserId(`/orgs/${orgId}`);
  const list = await listWorkspaces(userId);
  const target = list.find((w) => w.orgId === orgId);
  const current = await activeWorkspace(userId, list);
  return (
    <>
      {target && <SyncWorkspace target={target.key} current={current.key} />}
      {children}
    </>
  );
}
