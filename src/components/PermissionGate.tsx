"use client";

import { ReactNode } from "react";
import { useWorkspacePermissions } from "@/hooks/useWorkspacePermissions";

export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useWorkspacePermissions();
  if (!can(permission)) return <>{fallback}</>;
  return <>{children}</>;
}
