import { getServerActiveWorkspace, getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import type { ActiveClient } from "@/lib/vyron-developer-client";
import type { WorkspaceUserRole } from "@/lib/vyron-workspace-permissions";

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
  sessionRole: WorkspaceUserRole | null;
  /**
   * The permissions the server resolved for this member.
   *
   * getServerWorkspaceSession reads them from vyron_workspace_memberships, so
   * these are the same permissions the API enforces. The browser needs them to
   * decide what to offer; without them it can only guess from the role, and a
   * member with a permission granted specifically to them was shown a screen
   * with the action missing.
   */
  sessionPermissions: Record<string, boolean> | null;
  sessionEmail: string | null;
  activeClientSummary: Pick<
    ActiveClient,
    "id" | "companyName" | "tradingName" | "packageName" | "status" | "companyId" | "impersonating" | "ownerEmail" | "ownerUserId"
  > | null;
};

export function isXeroWorkspaceActive(
  status: Pick<WorkspaceStatusReport, "xeroWorkspaceReady" | "hasWorkspaceCookie" | "companyLinked">
): boolean {
  if (status.xeroWorkspaceReady) return true;
  return status.hasWorkspaceCookie && status.companyLinked;
}

export function parseWorkspaceStatusPayload(data: unknown): WorkspaceStatusReport | null {
  if (!data || typeof data !== "object" || !(data as WorkspaceStatusReport).ok) {
    return null;
  }

  const payload = data as WorkspaceStatusReport;
  const workspaceId = payload.workspaceId || payload.serverWorkspaceId || null;
  const companyId = payload.companyId || payload.serverCompanyId || null;

  return {
    ...payload,
    workspaceId,
    companyId,
    serverWorkspaceId: payload.serverWorkspaceId || workspaceId,
    serverCompanyId: payload.serverCompanyId || companyId,
    hasWorkspaceCookie: Boolean(payload.hasWorkspaceCookie ?? payload.hasActiveClientCookie),
    hasSessionCookie: Boolean(payload.hasSessionCookie ?? payload.hasWorkspaceSession),
    companyLinked: Boolean(payload.companyLinked ?? companyId),
    xeroWorkspaceReady: Boolean(
      payload.xeroWorkspaceReady ?? (Boolean(workspaceId) && Boolean(companyId))
    ),
  };
}

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
    sessionRole: session?.role || null,
    sessionPermissions: session?.permissions || null,
    sessionEmail: session?.email || client?.ownerEmail || null,
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
