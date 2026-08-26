import { NextRequest, NextResponse } from "next/server";
import { requireAdminWorkspaceId } from "@/lib/vyron-workspace-admin-server";
import { deleteWorkspaceMember, updateWorkspaceMember, type WorkspaceRole } from "@/lib/vyron-saas-workspace";

export const runtime = "nodejs";

function adminErrorStatus(error: unknown, fallback = 400) {
  const message = error instanceof Error ? String(error.message || "") : "";
  if (message.includes("Workspace session required") || message.includes("Access denied") || message.includes("Admin access required")) {
    return 403;
  }
  if (message.includes("No active client workspace")) return 400;
  return fallback;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { workspaceId } = await requireAdminWorkspaceId();
    const { userId } = await context.params;
    const body = (await request.json()) as {
      role?: WorkspaceRole;
      status?: "Active" | "Disabled" | "Invited";
      permissions?: Record<string, boolean>;
    };
    const member = await updateWorkspaceMember(workspaceId, userId, body);
    return NextResponse.json({ ok: true, member });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "User update failed." },
      { status: adminErrorStatus(error, 400) }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const { workspaceId } = await requireAdminWorkspaceId();
    const { userId } = await context.params;
    await deleteWorkspaceMember(workspaceId, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "User delete failed." },
      { status: 400 }
    );
  }
}
