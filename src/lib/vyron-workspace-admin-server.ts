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

export async function getServerWorkspaceSession(): Promise<WorkspaceSession | null> {
  if (typeof window !== "undefined") {
    const { readWorkspaceSession } = await import("@/lib/vyron-workspace-session");
    return readWorkspaceSession();
  }
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    return parseWorkspaceSession(cookieStore.get(WORKSPACE_SESSION_KEY)?.value);
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
