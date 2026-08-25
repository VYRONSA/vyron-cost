import { parseCookieJsonValue } from "@/lib/vyron-workspace-cookie-parse";
import { expandWorkspaceSessionFromCookie } from "@/lib/vyron-workspace-cookies";
import { WORKSPACE_SESSION_KEY, type WorkspaceSession } from "@/lib/vyron-workspace-session";
import { getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
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

function parseWorkspaceSession(raw: string | null | undefined): WorkspaceSession | null {
  const parsed = parseCookieJsonValue<WorkspaceSession>(raw);
  if (!parsed) return null;
  const expanded = expandWorkspaceSessionFromCookie(parsed);
  if (!expanded) return null;
  return normalizeServerWorkspaceSession(expanded);
}

function normalizeServerWorkspaceSession(session: WorkspaceSession): WorkspaceSession {
  const role = normalizeWorkspaceRole(session.role);
  return {
    ...session,
    role,
    permissions: resolveEffectivePermissions(role, session.permissions),
  };
}

/**
 * Resolve a member's real role and permissions from the database.
 *
 * AUTHORISATION IS RESOLVED FROM THE DATABASE, NEVER FROM THE REQUEST.
 *
 * The workspace session cookie is not httpOnly, so anything in it can be edited
 * by the browser. Reading the role from it meant a member could grant
 * themselves OWNER, and OWNER bypasses every permission check. Reading the
 * permissions from it was impossible — they were never carried — so a member
 * with an explicitly granted permission fell back to their role's defaults and
 * was refused work they had been given rights to do.
 *
 * The cookie now identifies the member; the membership row decides what they
 * may do. Returns null when no active membership backs the cookie, so an
 * unverifiable session is refused rather than trusted.
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
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const fromCookie = parseWorkspaceSession(cookieStore.get(WORKSPACE_SESSION_KEY)?.value);
    if (!fromCookie) return null;

    const authorised = await resolveMembershipAuthorisation(
      String(fromCookie.workspaceId || ""),
      String(fromCookie.userId || "")
    );
    if (!authorised) return null;

    // Identity from the cookie, authority from the database.
    return { ...fromCookie, role: authorised.role as WorkspaceSession["role"], permissions: authorised.permissions };
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
