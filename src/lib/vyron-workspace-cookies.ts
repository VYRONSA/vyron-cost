import type { NextResponse } from "next/server";
import { ACTIVE_CLIENT_KEY, type ActiveClient } from "@/lib/vyron-developer-client";
import { WORKSPACE_SESSION_KEY, type WorkspaceSession } from "@/lib/vyron-workspace-session";
import { signWorkspaceToken, WORKSPACE_SESSION_TTL_SECONDS } from "@/lib/vyron-workspace-session-token";

export const WORKSPACE_AUTH_COOKIE_NAMES = [
  ACTIVE_CLIENT_KEY,
  WORKSPACE_SESSION_KEY,
] as const;

const WORKSPACE_COOKIE_MAX_AGE = WORKSPACE_SESSION_TTL_SECONDS;

export type CompactActiveClientCookie = {
  id: string;
  workspaceId: string;
  companyId: string | null;
  companyName: string;
  packageName: string;
  email: string;
  impersonating?: boolean;
};

export function isProductionCookieEnvironment() {
  return process.env.NODE_ENV === "production";
}

/**
 * Both workspace cookies are HttpOnly.
 *
 * No client script reads them — the shell learns its workspace from
 * /api/workspace/status — so script has no reason to see them, and an injected
 * script cannot lift the session. SameSite=Lax keeps them off cross-site
 * POSTs; Secure in production.
 */
export function workspaceCookieOptions(maxAge: number = WORKSPACE_COOKIE_MAX_AGE) {
  return {
    path: "/",
    maxAge,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: isProductionCookieEnvironment(),
  };
}

export function encodeCookieJson(payload: unknown) {
  return encodeURIComponent(JSON.stringify(payload));
}

export function compactActiveClientForCookie(client: ActiveClient): CompactActiveClientCookie {
  return {
    id: client.id,
    workspaceId: client.id,
    companyId: client.companyId ?? null,
    companyName: client.companyName,
    packageName: client.packageName || "Professional",
    email: client.ownerEmail || client.contactEmail || client.companyName,
    impersonating: client.impersonating,
  };
}

export function expandActiveClientFromCookie(
  value: CompactActiveClientCookie | (ActiveClient & Partial<CompactActiveClientCookie>)
): ActiveClient {
  if (value.companyName && (value as ActiveClient).tradingName) {
    return value as ActiveClient;
  }

  const workspaceId = value.workspaceId || value.id;
  return {
    id: workspaceId,
    companyId: value.companyId ?? null,
    companyName: value.companyName || "Client Workspace",
    tradingName: value.companyName || "Client Workspace",
    packageName: value.packageName || "Professional",
    status: "Active",
    ownerEmail: value.email,
    impersonating: value.impersonating,
  };
}

/**
 * Writes the session and the active-client display cookie.
 *
 * The session cookie is a token this server signed (see
 * vyron-workspace-session-token). It names the member and the workspace and
 * nothing else: no role, no permissions, no company, all of which the server
 * reads from the database on every request. It used to be JSON the browser
 * could rewrite, which let anyone who knew a member's ids become them.
 *
 * The active-client cookie is display data. The server ignores it unless it
 * names the same workspace as a verified session.
 */
export function setWorkspaceAuthCookiesOnResponse(
  response: NextResponse,
  client: ActiveClient,
  session: WorkspaceSession,
  maxAge: number = WORKSPACE_COOKIE_MAX_AGE
) {
  const options = workspaceCookieOptions(maxAge);
  const token = signWorkspaceToken(
    { kind: "ws", userId: session.userId, workspaceId: client.id, impersonating: client.impersonating === true },
    { ttlSeconds: maxAge }
  );

  response.cookies.set(ACTIVE_CLIENT_KEY, encodeCookieJson(compactActiveClientForCookie(client)), options);
  response.cookies.set(WORKSPACE_SESSION_KEY, token, options);

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
