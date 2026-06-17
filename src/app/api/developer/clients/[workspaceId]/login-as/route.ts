import { NextRequest, NextResponse } from "next/server";
import { startClientImpersonation } from "@/lib/vyron-saas-workspace";
import {
  buildImpersonationActiveClient,
  buildImpersonationWorkspaceSession,
} from "@/lib/vyron-workspace-impersonation";
import { applyWorkspaceAuthCookies } from "@/lib/vyron-workspace-cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
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
      workspace: result.workspace,
      client,
      session,
      ownerUserId: result.ownerUserId,
      ownerEmail: result.ownerEmail,
      loginStatus: result.loginStatus,
      message: result.message || `Workspace active: ${client.companyName}.`,
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
      { ok: false, error: error instanceof Error ? error.message : "Login As Client failed." },
      { status: 400 }
    );
  }
}
