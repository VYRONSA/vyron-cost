import type { NextResponse } from "next/server";
import { ACTIVE_CLIENT_KEY, type ActiveClient } from "@/lib/vyron-developer-client";
import { WORKSPACE_SESSION_KEY, type WorkspaceSession } from "@/lib/vyron-workspace-session";

export const WORKSPACE_AUTH_COOKIE_NAMES = [
  ACTIVE_CLIENT_KEY,
  WORKSPACE_SESSION_KEY,
] as const;

const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function isProductionCookieEnvironment() {
  return process.env.NODE_ENV === "production";
}

export function workspaceCookieOptions(maxAge: number = WORKSPACE_COOKIE_MAX_AGE) {
  return {
    path: "/",
    maxAge,
    sameSite: "lax" as const,
    httpOnly: false,
    secure: isProductionCookieEnvironment(),
  };
}

export function encodeCookieJson(payload: unknown) {
  // Next.js response.cookies.set() URL-encodes the value; do not pre-encode here.
  return JSON.stringify(payload);
}

/** Store role only in cookie; permissions are resolved server-side from role. */
export function compactWorkspaceSessionForCookie(session: WorkspaceSession): WorkspaceSession {
  return {
    userId: session.userId,
    email: session.email,
    firstName: session.firstName,
    surname: session.surname,
    role: session.role,
    permissions: {},
  };
}

export function setWorkspaceAuthCookiesOnResponse(
  response: NextResponse,
  client: ActiveClient,
  session: WorkspaceSession,
  maxAge: number = WORKSPACE_COOKIE_MAX_AGE
) {
  const options = workspaceCookieOptions(maxAge);
  const sessionCookie = compactWorkspaceSessionForCookie(session);

  response.cookies.set(ACTIVE_CLIENT_KEY, encodeCookieJson(client), options);
  response.cookies.set(WORKSPACE_SESSION_KEY, encodeCookieJson(sessionCookie), options);

  return response;
}

export function applyWorkspaceAuthCookies(
  response: NextResponse,
  client: ActiveClient,
  session: WorkspaceSession
) {
  return setWorkspaceAuthCookiesOnResponse(response, client, session);
}

export function clearWorkspaceAuthCookies(response: NextResponse) {
  const options = {
    ...workspaceCookieOptions(0),
    maxAge: 0,
    expires: new Date(0),
  };

  response.cookies.set(ACTIVE_CLIENT_KEY, "", options);
  response.cookies.set(WORKSPACE_SESSION_KEY, "", options);

  return response;
}
