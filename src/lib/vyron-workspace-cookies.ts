import type { NextResponse } from "next/server";
import { ACTIVE_CLIENT_KEY, type ActiveClient } from "@/lib/vyron-developer-client";
import { WORKSPACE_SESSION_KEY, type WorkspaceSession } from "@/lib/vyron-workspace-session";

function isProductionEnvironment() {
  return process.env.NODE_ENV === "production";
}

export function workspaceCookieOptions(maxAge: number) {
  return {
    path: "/",
    maxAge,
    sameSite: "lax" as const,
    httpOnly: false,
    secure: isProductionEnvironment(),
  };
}

export function applyWorkspaceAuthCookies(
  response: NextResponse,
  client: ActiveClient,
  session: WorkspaceSession
) {
  response.cookies.set(ACTIVE_CLIENT_KEY, JSON.stringify(client), workspaceCookieOptions(60 * 60 * 24 * 30));
  response.cookies.set(
    WORKSPACE_SESSION_KEY,
    JSON.stringify(session),
    workspaceCookieOptions(60 * 60 * 24)
  );
  return response;
}

export function clearWorkspaceAuthCookies(response: NextResponse) {
  response.cookies.set(ACTIVE_CLIENT_KEY, "", {
    ...workspaceCookieOptions(0),
    maxAge: 0,
    expires: new Date(0),
  });
  response.cookies.set(WORKSPACE_SESSION_KEY, "", {
    ...workspaceCookieOptions(0),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
