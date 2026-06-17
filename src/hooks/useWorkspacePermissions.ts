"use client";

import { useEffect, useMemo, useState } from "react";
import {
  resolvePermissionKey,
  sessionHasPermission,
} from "@/lib/vyron-workspace-permissions";
import { readWorkspaceSession, type WorkspaceSession } from "@/lib/vyron-workspace-session";

export function useWorkspacePermissions() {
  const [session, setSession] = useState<WorkspaceSession | null>(null);

  useEffect(() => {
    function refresh() {
      setSession(readWorkspaceSession());
    }
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("vyron-active-client-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("vyron-active-client-changed", refresh);
    };
  }, []);

  const can = useMemo(
    () => (permission: string) => {
      if (!session) return false;
      return sessionHasPermission(session, resolvePermissionKey(permission));
    },
    [session]
  );

  return { session, can };
}
