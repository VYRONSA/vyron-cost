import type { NextResponse } from "next/server";
import { ACTIVE_CLIENT_KEY, type ActiveClient } from "@/lib/vyron-developer-client";
import { WORKSPACE_SESSION_KEY, type WorkspaceSession } from "@/lib/vyron-workspace-session";
import type { WorkspaceUserRole } from "@/lib/vyron-workspace-permissions";

export const WORKSPACE_AUTH_COOKIE_NAMES = [
  ACTIVE_CLIENT_KEY,
  WORKSPACE_SESSION_KEY,
] as const;

const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export type CompactActiveClientCookie = {
  id: string;
  workspaceId: string;
  companyId: string | null;
  companyName: string;
  packageName: string;
  email: string;
  impersonating?: boolean;
};

export type CompactWorkspaceSessionCookie = {
  workspaceId: string;
  /**
   * Who the session belongs to.
   *
   * The cookie is not httpOnly and is therefore client-writable, so nothing in
   * it may be trusted for authorisation. It carries identity only: the server
   * looks the membership up and takes the role and permissions from the
   * database. Without this field the server cannot tell which member is
   * calling, which is why permissions previously fell back to role defaults.
   */
  userId: string;
  companyId: string | null;
  role: WorkspaceUserRole;
};

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

export function compactWorkspaceSessionForCookie(
  session: WorkspaceSession,
  workspaceId: string,
  companyId: string | null
): CompactWorkspaceSessionCookie {
  return {
    workspaceId,
    userId: session.userId,
    companyId,
    role: session.role,
  };
}

export function expandWorkspaceSessionFromCookie(
  value: CompactWorkspaceSessionCookie | WorkspaceSession
): WorkspaceSession | null {
  if ("userId" in value && value.userId && "email" in value && value.email) {
    return value as WorkspaceSession;
  }

  const compact = value as CompactWorkspaceSessionCookie;
  if (!compact.workspaceId || !compact.role) {
    return null;
  }

  return {
    // Falls back to the old synthetic id for cookies issued before userId was
    // carried; those sessions cannot be resolved against a membership and are
    // rejected by the server rather than silently trusted.
    userId: compact.userId || `workspace-${compact.workspaceId}`,
    email: "",
    firstName: "Workspace",
    surname: "User",
    workspaceId: compact.workspaceId,
    companyId: compact.companyId ?? null,
    role: compact.role,
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
  const clientCookie = compactActiveClientForCookie(client);
  const sessionCookie = compactWorkspaceSessionForCookie(session, client.id, client.companyId ?? null);

  response.cookies.set(ACTIVE_CLIENT_KEY, encodeCookieJson(clientCookie), options);
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
