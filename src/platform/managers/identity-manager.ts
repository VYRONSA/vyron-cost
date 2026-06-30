import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import { readWorkspaceSession } from "@/lib/vyron-workspace-session";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";

export async function resolveSession(): Promise<WorkspaceSession | null> {
  return getServerWorkspaceSession();
}

export function resolveClientSession(): WorkspaceSession | null {
  return readWorkspaceSession();
}

export function isAuthenticated(session: WorkspaceSession | null): boolean {
  return Boolean(session?.email);
}
