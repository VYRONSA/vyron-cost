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

export function writeWorkspaceSession(session: WorkspaceSession) {
  if (typeof window === "undefined") return;
  const role = normalizeWorkspaceRole(session.role);
  const normalized: WorkspaceSession = {
    ...session,
    role,
    permissions: resolveEffectivePermissions(role, session.permissions),
  };
  sessionStorage.setItem(WORKSPACE_SESSION_KEY, JSON.stringify(normalized));
  const value = JSON.stringify(normalized);
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${WORKSPACE_SESSION_KEY}=${value}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax${secure}`;
}

export function clearWorkspaceSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(WORKSPACE_SESSION_KEY);
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${WORKSPACE_SESSION_KEY}=; path=/; max-age=0; SameSite=Lax${secure}`;
}

export function bootstrapWorkspaceSession(client: ActiveClient, role: WorkspaceUserRole = "OWNER") {
  const normalizedRole = normalizeWorkspaceRole(role);
  writeWorkspaceSession({
    userId: client.ownerUserId || `owner-${client.id}`,
    email: client.ownerEmail || client.companyName,
    firstName: client.companyName.split(" ")[0] || "Workspace",
    surname: "Owner",
    role: normalizedRole,
    permissions: defaultPermissionsForRole(normalizedRole),
  });
}
