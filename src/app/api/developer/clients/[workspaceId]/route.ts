import { NextRequest, NextResponse } from "next/server";
import {
  archiveClientWorkspace,
  deleteClientWorkspace,
  getWorkspace,
} from "@/lib/vyron-saas-workspace";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      return NextResponse.json({ ok: false, error: "Workspace not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, workspace });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Workspace lookup failed." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { action?: string; archivedBy?: string };

    if (body.action !== "archive") {
      return NextResponse.json({ ok: false, error: "Unsupported action. Use action: archive." }, { status: 400 });
    }

    const workspace = await archiveClientWorkspace(workspaceId, body.archivedBy || "developer");
    return NextResponse.json({
      ok: true,
      mode: "archived",
      workspace,
      message: `${workspace?.companyName || "Workspace"} archived. Login access disabled.`,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Archive failed." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params;

  try {
    const result = await deleteClientWorkspace(workspaceId);
    return NextResponse.json({
      ...result,
      ok: true,
      mode: "deleted",
      message: "Client workspace permanently deleted.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed.";

    if (message.startsWith("WORKSPACE_HAS_DATA:")) {
      try {
        const workspace = await archiveClientWorkspace(workspaceId, "developer");
        const detail = message.replace("WORKSPACE_HAS_DATA:", "").trim();
        return NextResponse.json({
          ok: true,
          mode: "archived",
          workspace,
          message: `Delete blocked because linked operational data exists (${detail}). Workspace archived instead.`,
        });
      } catch (archiveError) {
        return NextResponse.json(
          {
            ok: false,
            error:
              archiveError instanceof Error
                ? archiveError.message
                : "Delete failed and archive fallback also failed.",
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
