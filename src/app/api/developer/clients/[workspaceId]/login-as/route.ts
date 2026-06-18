import { NextRequest, NextResponse } from "next/server";
import { startClientImpersonation } from "@/lib/vyron-saas-workspace";
import {
  buildImpersonationActiveClient,
  buildImpersonationWorkspaceSession,
} from "@/lib/vyron-workspace-impersonation";
import { setWorkspaceAuthCookiesOnResponse } from "@/lib/vyron-workspace-cookies";
import { clearAuthUserCookie } from "@/lib/vyron-workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
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

    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    clearAuthUserCookie(response);
    setWorkspaceAuthCookiesOnResponse(response, client, session);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login As Client failed.";
    return NextResponse.redirect(
      new URL(`/developer/clients?loginAsError=${encodeURIComponent(message)}`, request.url)
    );
  }
}
