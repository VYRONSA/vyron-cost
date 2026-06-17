import type { NextResponse } from "next/server";
import { ACTIVE_CLIENT_KEY, type ActiveClient } from "@/lib/vyron-developer-client";
import { WORKSPACE_SESSION_KEY, type WorkspaceSession } from "@/lib/vyron-workspace-session";

export function applyWorkspaceAuthCookies(
  response: NextResponse,
  client: ActiveClient,
  session: WorkspaceSession
) {
  const clientValue = encodeURIComponent(JSON.stringify(client));
  response.cookies.set(ACTIVE_CLIENT_KEY, clientValue, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: false,
  });

  const sessionValue = encodeURIComponent(JSON.stringify(session));
  response.cookies.set(WORKSPACE_SESSION_KEY, sessionValue, {
    path: "/",
    maxAge: 60 * 60 * 24,
    sameSite: "lax",
    httpOnly: false,
  });

  return response;
}
