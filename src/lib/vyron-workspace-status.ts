import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import type { ActiveClient } from "@/lib/vyron-developer-client";

export type WorkspaceStatusReport = {
  ok: boolean;
  hasActiveClientCookie: boolean;
  hasWorkspaceCookie: boolean;
  hasWorkspaceSession: boolean;
  hasSessionCookie: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
  companyLinked: boolean;
  companyId: string | null;
  serverWorkspaceId: string | null;
  serverCompanyId: string | null;
  impersonating: boolean;
  xeroWorkspaceReady: boolean;
  localStorageHint: string | null;
  activeClientSummary: Pick<
    ActiveClient,
    "id" | "companyName" | "tradingName" | "packageName" | "status" | "companyId" | "impersonating" | "ownerEmail" | "ownerUserId"
  > | null;
};

export async function buildWorkspaceStatusReport(): Promise<WorkspaceStatusReport> {
  const client = await getServerActiveWorkspace();
  const session = await getServerWorkspaceSession();
  const companyId = await getWorkspaceCompanyId();

  return {
    ok: true,
    hasActiveClientCookie: Boolean(client?.id),
    hasWorkspaceCookie: Boolean(client?.id),
    workspaceId: client?.id || null,
    workspaceName: client?.companyName || client?.tradingName || null,
    companyLinked: Boolean(companyId),
    companyId: companyId || null,
    serverWorkspaceId: client?.id || null,
    serverCompanyId: companyId || null,
    hasWorkspaceSession: Boolean(session),
    hasSessionCookie: Boolean(session),
    impersonating: Boolean(client?.impersonating),
    xeroWorkspaceReady: Boolean(client?.id && companyId),
    localStorageHint: client
      ? "Server workspace cookie is active."
      : "No server workspace cookie detected. Use Login As Client or Repair Workspace Session.",
    activeClientSummary: client
      ? {
          id: client.id,
          companyName: client.companyName,
          tradingName: client.tradingName,
          packageName: client.packageName,
          status: client.status,
          companyId: client.companyId || companyId || null,
          impersonating: client.impersonating,
          ownerEmail: client.ownerEmail,
          ownerUserId: client.ownerUserId,
        }
      : null,
  };
}
