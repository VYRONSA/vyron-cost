import type { WorkspaceSession } from "@/lib/vyron-workspace-session";
import { getServerActiveWorkspace, readVerifiedWorkspaceClaims } from "@/lib/vyron-workspace-server";
import { getPackageModules } from "@/lib/vyron-package-manager";
import {
  getWorkspace,
  getWorkspaceCompanyProfile,
  listWorkspaceMembers,
} from "@/lib/vyron-saas-workspace";
import {
  hasAdminAccess,
  normalizeWorkspaceRole,
  resolveEffectivePermissions,
  sessionHasPermission,
} from "@/lib/vyron-workspace-permissions";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isWorkspaceUuid(id: string) {
  return UUID_RE.test(id);
}

export async function requireActiveWorkspaceId(): Promise<string> {
  const client = await getServerActiveWorkspace();
  if (!client?.id) throw new Error("No active client workspace.");
  return client.id;
}

/**
 * The workspace an administrator is actually an administrator of.
 *
 * requireActiveWorkspaceId above reads vyron_cost_active_client, which is a
 * client-written cookie: it can be missing, stale, or simply wrong, and when it
 * was missing every admin user route failed with "No active client workspace"
 * before it reached the work it was asked to do.
 *
 * The session is the honest answer. getServerWorkspaceSession only returns a
 * session when vyron_workspace_memberships holds an Active membership for the
 * user the cookie names, so its workspaceId has already been proven against the
 * database. Nothing here reads a workspace or company from the request.
 */
export async function requireAdminWorkspaceId(
  permission: "admin.company" | "admin.users" | "admin.imports" = "admin.users"
): Promise<{ session: WorkspaceSession; workspaceId: string }> {
  const session = await requireAdminSession(permission);
  const workspaceId = String(session.workspaceId || "").trim();
  if (!workspaceId) throw new Error("Workspace session required.");
  return { session, workspaceId };
}

export async function getActiveWorkspaceCompanyProfile() {
  const client = await getServerActiveWorkspace();
  if (!client) throw new Error("No active client workspace.");
  return getWorkspaceCompanyProfile(client.id, {
    id: client.id,
    companyName: client.companyName,
    tradingName: client.tradingName,
    packageName: client.packageName,
    status: client.status,
    contactEmail: client.contactEmail,
    phone: client.phone,
    userLimit: client.userLimit,
    vatNumber: client.vatNumber,
    registrationNumber: client.registrationNumber,
    physicalAddress: client.physicalAddress,
    postalAddress: client.postalAddress,
    defaultVatRate: client.defaultVatRate,
    xeroStatus: client.xeroStatus,
  });
}

export async function assertAdminAccess(role: string) {
  if (!hasAdminAccess(role)) {
    throw new Error("Admin access required.");
  }
}

/**
 * Resolve a member's real role and permissions from the database.
 *
 * AUTHORISATION IS RESOLVED FROM THE DATABASE, NEVER FROM THE REQUEST.
 *
 * The signed session token says who the member is and which workspace they
 * signed in to; the membership row decides what they may do. Returns null when
 * no active membership backs the token, so a removed or disabled member is
 * refused on their next request even though their token is still genuine.
 */
async function resolveMembershipAuthorisation(
  workspaceId: string,
  userId: string
): Promise<{ role: string; permissions: Record<string, boolean> } | null> {
  if (!workspaceId || !userId) return null;
  // Cookies issued before userId was carried produce this synthetic id; it
  // identifies no member, so the session cannot be verified.
  if (userId.startsWith("workspace-")) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("vyron_workspace_memberships")
      .select("role, permissions, status")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    if (String(data.status || "") !== "Active") return null;

    const role = normalizeWorkspaceRole(String(data.role || ""));
    const saved = (data.permissions && typeof data.permissions === "object"
      ? data.permissions
      : {}) as Record<string, boolean>;

    return { role, permissions: resolveEffectivePermissions(role, saved) };
  } catch {
    return null;
  }
}

export async function getServerWorkspaceSession(): Promise<WorkspaceSession | null> {
  if (typeof window !== "undefined") {
    const { readWorkspaceSession } = await import("@/lib/vyron-workspace-session");
    return readWorkspaceSession();
  }
  try {
    /*
     * Identity comes only from a token this server signed. The cookie used to
     * be JSON naming a userId and workspaceId, and was trusted as written:
     * anyone who knew a member's ids could become that member.
     */
    const claims = await readVerifiedWorkspaceClaims();
    if (!claims?.wid) return null;

    const authorised = await resolveMembershipAuthorisation(claims.wid, claims.sub);
    if (!authorised) return null;

    // Identity from the signed token, authority from the database.
    return {
      userId: claims.sub,
      email: "",
      firstName: "Workspace",
      surname: "User",
      workspaceId: claims.wid,
      companyId: null,
      role: authorised.role as WorkspaceSession["role"],
      permissions: authorised.permissions,
    };
  } catch {
    return null;
  }
}

export async function requireAdminSession(
  permission: "admin.company" | "admin.users" | "admin.imports" = "admin.users"
): Promise<WorkspaceSession> {
  const session = await getServerWorkspaceSession();
  if (!session) throw new Error("Workspace session required.");
  if (!sessionHasPermission(session, permission)) {
    throw new Error("Access denied.");
  }
  return session;
}

export async function getWorkspaceModuleAccess(packageName: string) {
  return getPackageModules(packageName);
}

export async function getWorkspaceUserLimit(workspaceId: string) {
  const workspace = await getWorkspace(workspaceId);
  if (workspace) return workspace.userLimit;
  const client = await getServerActiveWorkspace();
  return client?.userLimit ?? 5;
}

export async function countWorkspaceUsers(workspaceId: string) {
  const members = await listWorkspaceMembers(workspaceId);
  return members.filter((member) => member.status !== "Disabled").length;
}
