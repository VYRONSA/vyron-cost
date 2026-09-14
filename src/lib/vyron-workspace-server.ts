import { HANDCRAFTED_COMPANY_ID } from "@/lib/vyron-handcrafted-intelligence";
import { isHandcraftedDataReady, isHandcraftedTenantEnabled } from "@/lib/handcrafted-tenant";
import { ACTIVE_CLIENT_KEY, readActiveClient, type ActiveClient } from "@/lib/vyron-developer-client";
import { parseCookieJsonValue } from "@/lib/vyron-workspace-cookie-parse";
import { expandActiveClientFromCookie } from "@/lib/vyron-workspace-cookies";
import {
  isHandcraftedSandboxWorkspace,
  lookupWorkspaceCompanyIdFromDatabase,
} from "@/lib/vyron-workspace-company-resolution";
import { WORKSPACE_SESSION_KEY } from "@/lib/vyron-workspace-session";
import { verifyWorkspaceToken, type WorkspaceTokenClaims } from "@/lib/vyron-workspace-session-token";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return UUID_RE.test(String(value || "").trim());
}

export function parseActiveClient(raw: string | null | undefined): ActiveClient | null {
  const parsed = parseCookieJsonValue<ActiveClient>(raw);
  if (!parsed) return null;
  return expandActiveClientFromCookie(parsed);
}

/**
 * The claims of the signed workspace session cookie, or null.
 *
 * The only place the session cookie is read. Nothing it contains is believed
 * until the signature, purpose and lifetime check out; whether the member may
 * still act is then decided against the database by getServerWorkspaceSession.
 */
export async function readVerifiedWorkspaceClaims(): Promise<WorkspaceTokenClaims | null> {
  if (typeof window !== "undefined") return null;
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    return verifyWorkspaceToken(cookieStore.get(WORKSPACE_SESSION_KEY)?.value, "ws");
  } catch {
    return null;
  }
}

/**
 * The active-client display record, for the workspace the signed session is in.
 *
 * The cookie is written by the server but is display data — names, package,
 * a companyId hint. It no longer chooses a workspace: it is returned only when
 * it names the same workspace as a verified session, and whether the session
 * came from a platform operator's Login As is taken from the signed session,
 * not from the cookie.
 */
export async function getServerActiveWorkspace(): Promise<ActiveClient | null> {
  if (typeof window !== "undefined") {
    return readActiveClient();
  }
  try {
    const claims = await readVerifiedWorkspaceClaims();
    if (!claims?.wid) return null;
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const client = parseActiveClient(cookieStore.get(ACTIVE_CLIENT_KEY)?.value);
    if (!client || client.id !== claims.wid) return null;
    return { ...client, impersonating: claims.imp === true };
  } catch {
    return null;
  }
}

/**
 * Whether this request may be served the Handcrafted sandbox's demo data.
 *
 * Only a verified session whose workspace company IS the sandbox company
 * qualifies. The active-client cookie's demo flags (demoMode, status, package
 * name) are display data a browser can edit; they used to be enough on their
 * own, so a real tenant could switch itself onto the sandbox's data.
 */
export async function shouldUseWorkspaceDemoData(): Promise<boolean> {
  if (!isHandcraftedTenantEnabled() || !isHandcraftedDataReady()) return false;
  return (await getWorkspaceCompanyId()) === HANDCRAFTED_COMPANY_ID;
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

  // The signed session carries no company; the workspace record is the answer.
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
 * The sandbox tenant, for a verified session whose workspace company is the
 * sandbox company. The active-client cookie's demo flags do not count.
 *
 * Previously any cookie shaped like the demo workspace returned Handcrafted's
 * company id, which was a read straight into a live tenant.
 */
export async function getWorkspaceTenantId(): Promise<string | null> {
  return (await getWorkspaceCompanyId()) === HANDCRAFTED_COMPANY_ID ? HANDCRAFTED_COMPANY_ID : null;
}
