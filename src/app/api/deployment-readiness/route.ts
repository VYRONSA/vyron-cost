import { NextResponse } from "next/server";
import { buildDeploymentReadinessReport } from "@/lib/vyron-deployment-readiness";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import {
  resolvePermissionKey,
  sessionHasPermission,
} from "@/lib/vyron-workspace-permissions";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertDeploymentReadAccess() {
  const session = await getServerWorkspaceSession();
  if (!session) return;
  const allowed = sessionHasPermission(session, resolvePermissionKey("admin.company"));
  if (!allowed) {
    throw new WorkspaceAccessError(
      "Deployment readiness is restricted to platform developers and workspace administrators.",
      403
    );
  }
}

export async function GET() {
  try {
    await assertDeploymentReadAccess();
    const report = await buildDeploymentReadinessReport();

    return NextResponse.json({
      ok: report.ok,
      environment: {
        nodeEnv: report.environment.nodeEnv,
        supabaseUrl: report.environment.supabaseUrl === "configured",
        supabaseAnonKey: report.environment.supabaseAnonKey === "configured",
        supabaseServiceRole: report.environment.supabaseServiceRole === "configured",
        xeroClientId: report.environment.xeroClientId === "configured",
        xeroClientSecret: report.environment.xeroClientSecret === "configured",
        xeroRedirectUri: report.environment.xeroRedirectUri === "configured",
      },
      workspace: report.workspace,
      company: report.company,
      executionPersistence: {
        mode: report.executionPersistence.mode,
        tableReady: report.executionPersistence.tableReady,
        warning: report.executionPersistence.warning,
      },
      migrations: report.migrations.map((row) => ({
        id: row.id,
        label: row.label,
        file: row.file,
        applied: row.status === "configured",
        detail: row.detail,
      })),
      schemaTables: report.schemaTables.map((row) => ({
        table: row.table,
        label: row.label,
        migrationFile: row.migrationFile,
        present: row.status === "configured",
        detail: row.detail,
      })),
      xero: {
        oauthReady: report.xero.oauthReady,
        connected: report.xero.connected,
        status: report.xero.status,
        organisationName: report.xero.organisationName,
        missingEnvVars: report.xero.missingEnvVars,
      },
      build: report.build,
      warnings: report.warnings,
    });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Deployment readiness check failed." },
      { status: 500 }
    );
  }
}
