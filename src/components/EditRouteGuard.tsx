"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import WorkspaceAccessDenied from "@/components/WorkspaceAccessDenied";
import { useWorkspacePermissions } from "@/hooks/useWorkspacePermissions";

export default function EditRouteGuard({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { can, session } = useWorkspacePermissions();

  if (!session) {
    return <WorkspaceAccessDenied pathname={pathname} permission="workspace.session" />;
  }

  if (!can(permission)) {
    return <WorkspaceAccessDenied pathname={pathname} permission={permission} />;
  }

  return <>{children}</>;
}
