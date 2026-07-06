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
import {
  OPERATIONS_CATCHUP_SQL,
  OPERATIONS_SCHEMA_TABLES,
  SchemaReadinessError,
} from "@/lib/vyron-schema-readiness";

export class WorkspaceAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "WorkspaceAccessError";
    this.status = status;
  }
}

function parseMissingTable(message: string): string | null {
  const direct = message.match(/table\s+'public\.([a-zA-Z0-9_]+)'/i);
  if (direct?.[1]) return direct[1];

  const relation = message.match(/relation\s+"public\.([a-zA-Z0-9_]+)"\s+does not exist/i);
  if (relation?.[1]) return relation[1];

  return null;
}

function missingTableSchemaHint(table: string | null) {
  if (!table) {
    return {
      catchupSql: null,
      hint: "Database schema cache may be stale or the table is missing. Verify migrations and reload API schema cache.",
    };
  }

  const operationsTables = new Set<string>(OPERATIONS_SCHEMA_TABLES.map((row) => row.table));
  if (operationsTables.has(table)) {
    return {
      catchupSql: OPERATIONS_CATCHUP_SQL,
      hint: "Sprint operations migrations are not applied to this Supabase project.",
    };
  }

  if (
    table.startsWith("vyron_cost_production_") ||
    table === "vyron_stock_movements" ||
    table === "vyron_finished_goods"
  ) {
    return {
      catchupSql: "supabase/manufacturing-batch-d-production.sql",
      hint: "Manufacturing schema is missing or not visible in API schema cache. Apply manufacturing migration and reload schema cache.",
    };
  }

  return {
    catchupSql: null,
    hint: "Required table is missing from the API schema cache. Verify migration state and reload schema cache.",
  };
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
  if (
    error instanceof Error &&
    (error.message.toLowerCase().includes("could not find the table") ||
      error.message.toLowerCase().includes("does not exist"))
  ) {
    const missingTable = parseMissingTable(error.message);
    const schemaHint = missingTableSchemaHint(missingTable);
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        schema: {
          missingTable,
          catchupSql: schemaHint.catchupSql,
          hint: schemaHint.hint,
        },
      },
      { status: 503 }
    );
  }
  const message =
    error instanceof Error && String(error.message || "").trim().length
      ? error.message
      : fallbackMessage;
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

export function canMutate(
  session: import("@/lib/vyron-workspace-permissions").WorkspacePermissionSession,
  module: string,
  action: "create" | "edit" | "delete"
): boolean {
  return sessionHasPermission(session, `${module}.${action}`);
}
