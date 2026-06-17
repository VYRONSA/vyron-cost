import { NextRequest, NextResponse } from "next/server";
import {
  authenticateWorkspaceLogin,
  workspaceLoginToActiveClient,
  workspaceLoginToSession,
} from "@/lib/vyron-workspace-login";
import { applyWorkspaceAuthCookies } from "@/lib/vyron-workspace-cookies";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = String(body.email || "").trim();
    const password = String(body.password || "");

    const { workspace, member } = await authenticateWorkspaceLogin(email, password);
    const client = workspaceLoginToActiveClient(workspace, member);
    const session = workspaceLoginToSession(member);

    const response = NextResponse.json({
      ok: true,
      client,
      session,
      redirect: "/dashboard",
    });

    applyWorkspaceAuthCookies(response, client, session);
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Login failed." },
      { status: 401 }
    );
  }
}
