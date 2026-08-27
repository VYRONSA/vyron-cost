import { HANDCRAFTED_COMPANY_ID } from "@/lib/vyron-handcrafted-intelligence";
import { isHandcraftedDataReady, isHandcraftedTenantEnabled } from "@/lib/handcrafted-tenant";
import { ACTIVE_CLIENT_KEY, readActiveClient, type ActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { parseCookieJsonValue } from "@/lib/vyron-workspace-cookie-parse";
import { expandActiveClientFromCookie, expandWorkspaceSessionFromCookie } from "@/lib/vyron-workspace-cookies";
import {
  isHandcraftedSandboxWorkspace,
  lookupWorkspaceCompanyIdFromDatabase,
} from "@/lib/vyron-workspace-company-resolution";
import { WORKSPACE_SESSION_KEY } from "@/lib/vyron-workspace-session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return UUID_RE.test(String(value || "").trim());
}

export function parseActiveClient(raw: string | null | undefined): ActiveClient | null {
  const parsed = parseCookieJsonValue<ActiveClient>(raw);
  if (!parsed) return null;
  return expandActiveClientFromCookie(parsed);
}

export async function getServerActiveWorkspace(): Promise<ActiveClient | null> {
  if (typeof window !== "undefined") {
    return readActiveClient();
  }
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    return parseActiveClient(cookieStore.get(ACTIVE_CLIENT_KEY)?.value);
  } catch {
    return null;
  }
}

export async function shouldUseWorkspaceDemoData(): Promise<boolean> {
  const client = await getServerActiveWorkspace();
  return isHandcraftedTenantEnabled() && isHandcraftedDataReady() && isDemoWorkspace(client);
}

/**
 * The workspace the signed-in member is actually a member of.
 *
 * getServerWorkspaceSession is backed by vyron_workspace_memberships, so it
 * returns null unless an Active membership exists for the user the cookie
 * names. Imported dynamically because that module imports this one.
 */
export async function authorisedWorkspaceId(): Promise<string | null> {
  try {
    const { getServerWorkspaceSession } = await import("@/lib/vyron-workspace-admin-server");
    const session = await getServerWorkspaceSession();
    const workspaceId = session?.workspaceId?.trim();
    return workspaceId ? workspaceId : null;
  } catch {
    return null;
  }
}

/**
 * THE authoritative operational company_id. Every server-side read and write
 * scopes on this.
 *
 * A browser can identify a session. It can never decide what company that
 * session sees. Previously this trusted three client-controlled values in turn
 * — a demoMode flag that mapped straight onto Handcrafted, a workspace id the
 * cookie chose, and a raw companyId — so editing a cookie selected the tenant.
 *
 * The order is now inverted. The member is verified against the database first,
 * and the company is read from the workspace record for the workspace they
 * belong to. Anything the cookie asks for is a hint: a hint that disagrees is
 * refused rather than quietly substituted, because silently serving a different
 * tenant's data is worse than an error.
 *
 * vyron_workspaces.company_id is a single column and no company is shared
 * across workspaces, so one workspace resolves to exactly one company. If a
 * company selector is ever added, the selected company must be validated
 * against the member's workspace here rather than accepted from the request.
 */
export async function getWorkspaceCompanyId(): Promise<string | null> {
  const workspaceId = await authorisedWorkspaceId();
  if (!workspaceId) return null;

  const client = await getServerActiveWorkspace();

  /*
   * The Handcrafted sandbox mapping still applies, but only to the workspace
   * the member is verified to be in — a cookie can no longer claim it.
   */
  if (client?.id === workspaceId && client.demoMode === true && isHandcraftedSandboxWorkspace(client)) {
    return HANDCRAFTED_COMPANY_ID;
  }

  const companyId = await lookupWorkspaceCompanyIdFromDatabase(workspaceId);
  if (!companyId) return null;

  // Cookie hints may not select a tenant.
  const requestedFromClient = client?.id === workspaceId ? client?.companyId?.trim() || null : null;
  if (requestedFromClient && isUuid(requestedFromClient) && requestedFromClient !== companyId) {
    return null;
  }

  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const raw = cookieStore.get(WORKSPACE_SESSION_KEY)?.value;
    const parsed = parseCookieJsonValue<Parameters<typeof expandWorkspaceSessionFromCookie>[0]>(raw);
    const session = parsed ? expandWorkspaceSessionFromCookie(parsed) : null;
    const requestedFromSession = session?.companyId?.trim() || null;
    if (requestedFromSession && isUuid(requestedFromSession) && requestedFromSession !== companyId) {
      return null;
    }
  } catch {
    // No cookie to disagree with; the database answer stands.
  }

  return companyId;
}

/**
 * The same authoritative answer, in the shape the document-intelligence
 * pipeline expects.
 *
 * Built on getWorkspaceCompanyId rather than resolving separately, so there is
 * one tenant mechanism and not a second one that could drift from it.
 */
export async function getWorkspaceCompanyResolution() {
  const workspaceId = await authorisedWorkspaceId();
  const companyId = await getWorkspaceCompanyId();
  if (!workspaceId || !companyId) {
    return { companyId: null, workspaceId: workspaceId ?? null, source: "unresolved" as const };
  }
  return { companyId, workspaceId, source: "workspace-record" as const };
}

/**
 * The sandbox tenant, for a member verified to be in the demo workspace.
 *
 * Previously any cookie shaped like the demo workspace returned Handcrafted's
 * company id, which was a read straight into a live tenant.
 */
export async function getWorkspaceTenantId(): Promise<string | null> {
  const workspaceId = await authorisedWorkspaceId();
  if (!workspaceId) return null;
  const client = await getServerActiveWorkspace();
  if (!client || client.id !== workspaceId || !isDemoWorkspace(client)) return null;
  return HANDCRAFTED_COMPANY_ID;
}
