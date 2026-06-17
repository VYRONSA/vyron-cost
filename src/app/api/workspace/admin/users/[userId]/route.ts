import { NextRequest, NextResponse } from "next/server";
import { requireActiveWorkspaceId, requireAdminSession } from "@/lib/vyron-workspace-admin-server";
import { deleteWorkspaceMember, updateWorkspaceMember, type WorkspaceRole } from "@/lib/vyron-saas-workspace";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdminSession();
    const workspaceId = await requireActiveWorkspaceId();
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
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdminSession();
    const workspaceId = await requireActiveWorkspaceId();
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
