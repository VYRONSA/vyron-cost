import { NextRequest, NextResponse } from "next/server";
import { getAuthUserIdFromCookies } from "@/lib/vyron-workspace-auth";
import { applyWorkspaceAuthCookies } from "@/lib/vyron-workspace-cookies";
import {
  resolveWorkspaceSessionForAuthUser,
  workspaceLoginToActiveClient,
  workspaceLoginToSession,
} from "@/lib/vyron-workspace-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_WORKSPACE_MESSAGE =
  "No workspace is linked to this login. Contact your VYRON administrator.";

async function restoreWorkspaceSession(authUserId: string) {
  const { workspace, member } = await resolveWorkspaceSessionForAuthUser(authUserId);
  const client = workspaceLoginToActiveClient(workspace, member);
  const session = workspaceLoginToSession(member);
  const companyId = workspace.companyId || null;

  return {
    client,
    session,
    workspaceId: workspace.id,
    companyId,
    workspaceName: workspace.companyName || workspace.tradingName || workspace.id,
    companyLinked: Boolean(companyId),
  };
}

export async function GET(request: NextRequest) {
  try {
    const authUserId = await getAuthUserIdFromCookies();
    if (!authUserId) {
      return NextResponse.redirect(new URL("/login?error=Not%20authenticated", request.url));
    }

    const restored = await restoreWorkspaceSession(authUserId);
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    applyWorkspaceAuthCookies(response, restored.client, restored.session);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : NO_WORKSPACE_MESSAGE;
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, request.url));
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUserId = await getAuthUserIdFromCookies();
    if (!authUserId) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const restored = await restoreWorkspaceSession(authUserId);
    const response = NextResponse.json({
      ok: true,
      workspaceId: restored.workspaceId,
      companyId: restored.companyId,
      workspaceName: restored.workspaceName,
      companyLinked: restored.companyLinked,
      client: restored.client,
      session: restored.session,
    });

    applyWorkspaceAuthCookies(response, restored.client, restored.session);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : NO_WORKSPACE_MESSAGE;
    return NextResponse.json({ ok: false, error: message }, { status: 404 });
  }
}
