import {
  defaultPermissionsForRole,
  normalizeWorkspaceRole,
  resolveEffectivePermissions,
  type WorkspaceUserRole,
} from "@/lib/vyron-workspace-permissions";
import type { ActiveClient } from "@/lib/vyron-developer-client";

export const WORKSPACE_SESSION_KEY = "vyron_workspace_user_session";

export type WorkspaceSession = {
  userId: string;
  email: string;
  firstName: string;
  surname: string;
  workspaceId?: string | null;
  companyId?: string | null;
  role: WorkspaceUserRole;
  permissions: Record<string, boolean>;
};

export function readWorkspaceSession(): WorkspaceSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WORKSPACE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceSession;
    const role = normalizeWorkspaceRole(parsed.role);
    return {
      ...parsed,
      role,
      permissions: resolveEffectivePermissions(role, parsed.permissions),
    };
  } catch {
    return null;
  }
}

export function writeWorkspaceSession(session: WorkspaceSession, _options?: { skipCookieSync?: boolean }) {
  if (typeof window === "undefined") return;
  const role = normalizeWorkspaceRole(session.role);
  const normalized: WorkspaceSession = {
    ...session,
    role,
    permissions: resolveEffectivePermissions(role, session.permissions),
  };
  sessionStorage.setItem(WORKSPACE_SESSION_KEY, JSON.stringify(normalized));
}

export function clearWorkspaceSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(WORKSPACE_SESSION_KEY);
}

export function bootstrapWorkspaceSession(
  client: ActiveClient,
  role: WorkspaceUserRole = "OWNER",
  options?: { skipCookieSync?: boolean }
) {
  const normalizedRole = normalizeWorkspaceRole(role);
  writeWorkspaceSession(
    {
      userId: client.ownerUserId || `owner-${client.id}`,
      email: client.ownerEmail || client.companyName,
      firstName: client.companyName.split(" ")[0] || "Workspace",
      surname: "Owner",
      role: normalizedRole,
      permissions: defaultPermissionsForRole(normalizedRole),
    },
    options
  );
}
