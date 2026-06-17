import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";

export type WorkspaceStatusReport = {
  ok: boolean;
  hasActiveClientCookie: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
  companyLinked: boolean;
  companyId: string | null;
  hasWorkspaceSession: boolean;
  impersonating: boolean;
  xeroWorkspaceReady: boolean;
  localStorageHint: string | null;
};

export async function buildWorkspaceStatusReport(): Promise<WorkspaceStatusReport> {
  const client = await getServerActiveWorkspace();
  const session = await getServerWorkspaceSession();
  const companyId = await getWorkspaceCompanyId();

  return {
    ok: true,
    hasActiveClientCookie: Boolean(client?.id),
    workspaceId: client?.id || null,
    workspaceName: client?.companyName || client?.tradingName || null,
    companyLinked: Boolean(companyId),
    companyId: companyId || null,
    hasWorkspaceSession: Boolean(session),
    impersonating: Boolean(client?.impersonating),
    xeroWorkspaceReady: Boolean(client?.id && companyId),
    localStorageHint: client
      ? "Server workspace cookie is active."
      : "No server workspace cookie detected. Use Login As Client or Repair Workspace Session.",
  };
}
