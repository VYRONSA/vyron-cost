import { NextRequest, NextResponse } from "next/server";
import {
  authenticateWorkspaceLogin,
  workspaceLoginToActiveClient,
  workspaceLoginToSession,
} from "@/lib/vyron-workspace-login";
import { setAuthUserCookie } from "@/lib/vyron-workspace-auth";
import { applyWorkspaceAuthCookies } from "@/lib/vyron-workspace-cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_WORKSPACE_MESSAGE =
  "No workspace is linked to this login. Contact your VYRON administrator.";

async function parseLoginBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { email?: string; password?: string };
    return {
      email: String(body.email || "").trim(),
      password: String(body.password || ""),
    };
  }

  const formData = await request.formData();
  return {
    email: String(formData.get("email") || "").trim(),
    password: String(formData.get("password") || ""),
  };
}

function wantsJsonResponse(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/json");
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await parseLoginBody(request);
    const { workspace, member, authUserId } = await authenticateWorkspaceLogin(email, password);
    const client = workspaceLoginToActiveClient(workspace, member);
    const session = workspaceLoginToSession(member);

    if (wantsJsonResponse(request)) {
      const response = NextResponse.json({
        ok: true,
        redirect: "/dashboard",
        restoreSession: true,
        client,
        session,
      });
      setAuthUserCookie(response, authUserId);
      applyWorkspaceAuthCookies(response, client, session);
      return response;
    }

    const response = NextResponse.redirect(new URL("/api/workspace/restore-session", request.url));
    setAuthUserCookie(response, authUserId);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed.";
    const displayMessage =
      message.includes("No active workspace") || message.includes("No workspace")
        ? NO_WORKSPACE_MESSAGE
        : message;

    if (wantsJsonResponse(request)) {
      return NextResponse.json({ ok: false, error: displayMessage }, { status: 401 });
    }

    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(displayMessage)}`, request.url)
    );
  }
}
