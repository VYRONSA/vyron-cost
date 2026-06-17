import { NextRequest, NextResponse } from "next/server";
import { startClientImpersonation } from "@/lib/vyron-saas-workspace";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import {
  buildImpersonationActiveClient,
  buildImpersonationWorkspaceSession,
} from "@/lib/vyron-workspace-impersonation";
import { applyWorkspaceAuthCookies } from "@/lib/vyron-workspace-cookies";
import {
  resolvePermissionKey,
  sessionHasPermission,
} from "@/lib/vyron-workspace-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canRepairWorkspace() {
  const client = await getServerActiveWorkspace();
  const session = await getServerWorkspaceSession();

  if (!client) return true;
  if (client.impersonating) return true;
  if (session && sessionHasPermission(session, resolvePermissionKey("admin.company"))) return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body.workspaceId || "").trim();

    if (!workspaceId) {
      return NextResponse.json({ ok: false, error: "workspaceId is required." }, { status: 400 });
    }

    const allowed = await canRepairWorkspace();
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Workspace repair is restricted to platform developers and workspace administrators." },
        { status: 403 }
      );
    }

    const result = await startClientImpersonation(workspaceId);
    const client = buildImpersonationActiveClient(result.workspace, {
      ownerUserId: result.ownerUserId,
      ownerEmail: result.ownerEmail,
      impersonating: true,
    });
    const session = buildImpersonationWorkspaceSession(
      result.workspace,
      result.ownerUserId,
      result.ownerEmail,
      "OWNER"
    );

    const response = NextResponse.json({
      ok: true,
      client,
      session,
      workspace: result.workspace,
      message: `Workspace session repaired for ${client.companyName}.`,
      status: {
        hasActiveClientCookie: true,
        workspaceId: client.id,
        workspaceName: client.companyName,
        companyLinked: Boolean(client.companyId),
        companyId: client.companyId || null,
        xeroWorkspaceReady: Boolean(client.companyId),
      },
    });

    applyWorkspaceAuthCookies(response, client, session);
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Workspace repair failed." },
      { status: 400 }
    );
  }
}
