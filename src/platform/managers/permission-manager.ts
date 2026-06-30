import {
  PERMISSION_GROUPS,
  canAccessPath,
  getRequiredPermissionForPath,
  hasPermission,
  mergePermissions,
  resolveEffectivePermissions,
  resolvePermissionKey,
  sessionHasPermission,
  type PermissionGroup,
  type PermissionKey,
  type WorkspacePermissionSession,
  type WorkspaceUserRole,
} from "@/lib/vyron-workspace-permissions";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";

export {
  PERMISSION_GROUPS,
  canAccessPath,
  getRequiredPermissionForPath,
  hasPermission,
  mergePermissions,
  resolveEffectivePermissions,
  resolvePermissionKey,
  sessionHasPermission,
  type PermissionGroup,
  type PermissionKey,
  type WorkspacePermissionSession,
  type WorkspaceUserRole,
};

export function hasPermissionFromSession(
  session: WorkspaceSession | WorkspacePermissionSession | null,
  permission: string
): boolean {
  if (!session) return false;
  return sessionHasPermission(session, permission);
}

export function canAccessPathFromSession(
  session: WorkspaceSession | WorkspacePermissionSession | null,
  path: string
): boolean {
  if (!session) return true;
  return canAccessPath(path, session);
}
