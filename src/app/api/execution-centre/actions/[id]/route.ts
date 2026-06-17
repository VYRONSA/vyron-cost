import { NextRequest, NextResponse } from "next/server";
import { computeExecutionDashboard } from "@/lib/vyron-execution-centre";
import {
  checkExecutionPersistence,
  ExecutionPersistenceError,
  listExecutionActions,
  updateExecutionAction,
  type ExecutionActionUpdate,
} from "@/lib/vyron-execution-actions-data";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("reports.export");
    const companyId = await requireApiCompanyId();
    const persistence = await checkExecutionPersistence();

    if (persistence.mode === "unavailable") {
      return NextResponse.json(
        {
          ok: false,
          error:
            persistence.warning ||
            "Execution actions cannot be updated because database persistence is unavailable in production.",
          persistence,
        },
        { status: 503 }
      );
    }

    const update: ExecutionActionUpdate = {};

    if (typeof body.status === "string") {
      const allowed = ["Recommended", "Approved", "In Progress", "Completed", "Cancelled"];
      if (!allowed.includes(body.status)) {
        return NextResponse.json({ ok: false, error: "Invalid status." }, { status: 400 });
      }
      update.status = body.status;
    }

    if (typeof body.owner === "string" && body.owner.trim()) {
      update.owner = body.owner.trim();
    }

    if (body.due_date === null || typeof body.due_date === "string") {
      update.due_date = body.due_date;
    }

    if (typeof body.notes === "string") {
      update.notes = body.notes;
    }

    if (typeof body.completion_notes === "string") {
      update.completion_notes = body.completion_notes;
    }

    if (body.actual_benefit === null || body.actual_benefit !== undefined) {
      update.actual_benefit =
        body.actual_benefit == null || body.actual_benefit === ""
          ? null
          : Number(body.actual_benefit);
    }

    const action = await updateExecutionAction(companyId, id, update, persistence);
    const rows = await listExecutionActions(companyId, persistence);
    const summary = computeExecutionDashboard(rows);

    return NextResponse.json({ ok: true, action, summary, persistence });
  } catch (error) {
    if (error instanceof ExecutionPersistenceError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    }
    return workspaceAccessErrorResponse(error, "Execution action update failed.");
  }
}
