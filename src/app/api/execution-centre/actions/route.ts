import { NextResponse } from "next/server";
import {
  collectExecutionCandidates,
  computeExecutionDashboard,
} from "@/lib/vyron-execution-centre";
import {
  checkExecutionPersistence,
  ExecutionPersistenceError,
  listExecutionActions,
  syncExecutionActions,
} from "@/lib/vyron-execution-actions-data";
import { loadAskVyronContext } from "@/lib/vyron-ask-vyron";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";
import { resolvePermissionKey, sessionHasPermission } from "@/lib/vyron-workspace-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canWriteExecutionActions() {
  const session = await getServerWorkspaceSession();
  if (!session) return false;
  return sessionHasPermission(session, resolvePermissionKey("reports.export"));
}

export async function GET() {
  try {
    await requireWorkspacePermission("reports.view");
    const companyId = await requireApiCompanyId();
    const persistence = await checkExecutionPersistence();
    const rows = await listExecutionActions(companyId, persistence);
    const summary = computeExecutionDashboard(rows);
    const canWrite = await canWriteExecutionActions();

    return NextResponse.json({
      ok: true,
      actions: rows,
      summary,
      candidateCount: 0,
      canWrite,
      persistence,
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Execution actions load failed.");
  }
}

export async function POST() {
  try {
    await requireWorkspacePermission("reports.export");

    const workspace = await getServerActiveWorkspace();
    const companyId = await requireApiCompanyId();
    if (!workspace?.id) {
      return NextResponse.json({ ok: false, error: "No active workspace." }, { status: 400 });
    }

    const persistence = await checkExecutionPersistence();
    if (persistence.mode === "unavailable") {
      return NextResponse.json(
        {
          ok: false,
          error:
            persistence.warning ||
            "Execution actions cannot be synced because database persistence is unavailable in production.",
          persistence,
        },
        { status: 503 }
      );
    }

    const context = await loadAskVyronContext();
    if (!context.input) {
      return NextResponse.json({ ok: false, error: "Intelligence context unavailable." }, { status: 400 });
    }

    const candidates = collectExecutionCandidates(context.input);
    const result = await syncExecutionActions(companyId, workspace.id, candidates, persistence);
    const summary = computeExecutionDashboard(result.rows);

    return NextResponse.json({
      ok: true,
      inserted: result.inserted,
      actions: result.rows,
      summary,
      candidateCount: candidates.length,
      canWrite: true,
      persistence,
    });
  } catch (error) {
    if (error instanceof ExecutionPersistenceError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    }
    return workspaceAccessErrorResponse(error, "Execution sync failed.");
  }
}
