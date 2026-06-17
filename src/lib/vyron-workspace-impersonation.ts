import type { ActiveClient, ActiveClientStatus } from "@/lib/vyron-developer-client";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";
import {
  defaultPermissionsForRole,
  type WorkspaceUserRole,
} from "@/lib/vyron-workspace-permissions";
import type { WorkspaceRecord } from "@/lib/vyron-saas-workspace";

function mapWorkspaceStatus(status: WorkspaceRecord["status"]): ActiveClientStatus {
  if (status === "Live") return "Active";
  if (status === "Demo" || status === "Setup" || status === "Suspended" || status === "Archived") {
    return status;
  }
  return "Setup";
}

export function buildImpersonationActiveClient(
  workspace: WorkspaceRecord,
  options: {
    ownerUserId: string;
    ownerEmail: string;
    impersonating?: boolean;
  }
): ActiveClient {
  return {
    id: workspace.id,
    companyId: workspace.companyId,
    companyName: workspace.companyName,
    tradingName: workspace.tradingName,
    packageName: workspace.packageName,
    status: mapWorkspaceStatus(workspace.status),
    ownerUserId: options.ownerUserId,
    ownerEmail: options.ownerEmail,
    contactEmail: workspace.contactEmail,
    phone: workspace.phone,
    userLimit: workspace.userLimit,
    demoMode: workspace.status === "Demo",
    impersonating: options.impersonating !== false,
    loginDisplayStatus:
      workspace.owner.loginStatus === "active" || options.ownerUserId ? "active_login" : "no_login_created",
  };
}

export function buildImpersonationWorkspaceSession(
  workspace: WorkspaceRecord,
  ownerUserId: string,
  ownerEmail: string,
  role: WorkspaceUserRole = "OWNER"
): WorkspaceSession {
  return {
    userId: ownerUserId,
    email: ownerEmail,
    firstName: workspace.owner.firstName || workspace.companyName.split(" ")[0] || "Workspace",
    surname: workspace.owner.surname || "Owner",
    role,
    permissions: defaultPermissionsForRole(role),
  };
}
