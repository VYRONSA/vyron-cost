import { NextResponse } from "next/server";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
import {
  hasFeature,
  getModulePrimaryFeature,
  type FeatureKey,
  type PackageModuleKey,
} from "@/platform";
import {
  resolvePermissionKey,
  sessionHasPermission,
} from "@/lib/vyron-workspace-permissions";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";
import { SchemaReadinessError } from "@/lib/vyron-schema-readiness";

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

export async function requirePackageFeature(feature: FeatureKey): Promise<WorkspaceSession> {
  const session = await requireWorkspacePermission("dashboard.view");
  const workspace = await getServerActiveWorkspace();
  const packageName = workspace?.packageName || "Professional";
  if (!hasFeature(packageName, feature)) {
    throw new WorkspaceAccessError("Feature not included in current package.", 403);
  }
  return session;
}

export async function requirePackageModule(moduleKey: PackageModuleKey): Promise<WorkspaceSession> {
  const primaryFeature = getModulePrimaryFeature(moduleKey);
  if (!primaryFeature) {
    return requireWorkspacePermission("dashboard.view");
  }
  return requirePackageFeature(primaryFeature);
}

export function workspaceAccessErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof WorkspaceAccessError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  if (error instanceof SchemaReadinessError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        schema: {
          missingTables: error.missingTables,
          catchupSql: error.catchupSql,
          hint: "Run the catch-up SQL in Supabase SQL Editor, then reload the API schema cache (Settings → API → Reload schema).",
        },
      },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message.toLowerCase().includes("could not find the table")) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        schema: {
          catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql",
          hint: "Sprint operations migrations are not applied to this Supabase project.",
        },
      },
      { status: 503 }
    );
  }
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : fallbackMessage },
    { status: 500 }
  );
}

export function canMutate(
  session: import("@/lib/vyron-workspace-permissions").WorkspacePermissionSession,
  module: string,
  action: "create" | "edit" | "delete"
): boolean {
  return sessionHasPermission(session, `${module}.${action}`);
}
