import { NextRequest, NextResponse } from "next/server";
import { startClientImpersonation } from "@/lib/vyron-saas-workspace";
import {
  buildImpersonationActiveClient,
  buildImpersonationWorkspaceSession,
} from "@/lib/vyron-workspace-impersonation";
import { ACTIVE_CLIENT_KEY, type ActiveClient } from "@/lib/vyron-developer-client";
import { WORKSPACE_SESSION_KEY, type WorkspaceSession } from "@/lib/vyron-workspace-session";
import {
  WORKSPACE_AUTH_COOKIE_NAMES,
  compactWorkspaceSessionForCookie,
  encodeCookieJson,
  workspaceCookieOptions,
} from "@/lib/vyron-workspace-cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function buildLoginAsPayload(workspaceId: string) {
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

  return { result, client, session };
}

function applyCookiesExplicit(response: NextResponse, client: ActiveClient, session: WorkspaceSession) {
  const options = workspaceCookieOptions();
  const sessionCookie = compactWorkspaceSessionForCookie(session);

  response.cookies.set(ACTIVE_CLIENT_KEY, encodeCookieJson(client), options);
  response.cookies.set(WORKSPACE_SESSION_KEY, encodeCookieJson(sessionCookie), options);

  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const { client, session } = await buildLoginAsPayload(workspaceId);

    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    applyCookiesExplicit(response, client, session);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login As Client failed.";
    return NextResponse.redirect(
      new URL(`/developer/clients?loginAsError=${encodeURIComponent(message)}`, request.url)
    );
  }
}

export async function POST(_request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const { result, client, session } = await buildLoginAsPayload(workspaceId);

    const response = NextResponse.json({
      ok: true,
      workspaceId: client.id,
      companyId: client.companyId || null,
      cookiesSet: true,
      cookieNames: [...WORKSPACE_AUTH_COOKIE_NAMES],
      workspace: result.workspace,
      client,
      session,
      ownerUserId: result.ownerUserId,
      ownerEmail: result.ownerEmail,
      loginStatus: result.loginStatus,
      message: result.message || `Workspace active: ${client.companyName}.`,
      status: {
        hasActiveClientCookie: true,
        hasWorkspaceCookie: true,
        workspaceId: client.id,
        workspaceName: client.companyName,
        companyLinked: Boolean(client.companyId),
        companyId: client.companyId || null,
        xeroWorkspaceReady: Boolean(client.companyId),
      },
    });

    applyCookiesExplicit(response, client, session);
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Login As Client failed." },
      { status: 400 }
    );
  }
}
