import { NextResponse } from "next/server";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import {
  resolvePermissionKey,
  sessionHasPermission,
  type WorkspacePermissionSession,
} from "@/lib/vyron-workspace-permissions";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";

export class WorkspaceAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "WorkspaceAccessError";
    this.status = status;
  }
}

export async function requireWorkspacePermission(
  permission: string
): Promise<WorkspaceSession> {
  const session = await getServerWorkspaceSession();
  if (!session) {
    throw new WorkspaceAccessError("Workspace session required.", 401);
  }
  const key = resolvePermissionKey(permission);
  if (!sessionHasPermission(session, key)) {
    throw new WorkspaceAccessError("Access denied.", 403);
  }
  return session;
}

export function workspaceAccessErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof WorkspaceAccessError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : fallbackMessage },
    { status: 500 }
  );
}

export function canMutate(
  session: WorkspacePermissionSession,
  module: string,
  action: "create" | "edit" | "delete"
): boolean {
  return sessionHasPermission(session, `${module}.${action}`);
}
