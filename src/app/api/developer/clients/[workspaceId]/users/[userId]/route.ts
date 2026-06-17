import { NextRequest, NextResponse } from "next/server";
import { deleteWorkspaceMember, updateWorkspaceMember, type MemberStatus, type WorkspaceRole } from "@/lib/vyron-saas-workspace";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; userId: string }> }
) {
  try {
    const { workspaceId, userId } = await context.params;
    const body = await request.json();
    const member = await updateWorkspaceMember(workspaceId, userId, {
      role: body.role as WorkspaceRole | undefined,
      status: body.status as MemberStatus | undefined,
    });
    return NextResponse.json({ ok: true, member });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Update failed." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ workspaceId: string; userId: string }> }
) {
  try {
    const { workspaceId, userId } = await context.params;
    await deleteWorkspaceMember(workspaceId, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Delete failed." },
      { status: 400 }
    );
  }
}
