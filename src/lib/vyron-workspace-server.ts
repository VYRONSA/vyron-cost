import { HANDCRAFTED_COMPANY_ID } from "@/lib/vyron-handcrafted-intelligence";
import { isHandcraftedDataReady, isHandcraftedTenantEnabled } from "@/lib/handcrafted-tenant";
import { ACTIVE_CLIENT_KEY, readActiveClient, type ActiveClient } from "@/lib/vyron-developer-client";
import { isDemoWorkspace } from "@/lib/vyron-workspace-context";
import { parseCookieJsonValue } from "@/lib/vyron-workspace-cookie-parse";
import { expandActiveClientFromCookie, expandWorkspaceSessionFromCookie } from "@/lib/vyron-workspace-cookies";
import { resolveActiveWorkspaceCompanyId } from "@/lib/vyron-workspace-company-resolution";
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
 * Single source of truth for operational company_id:
 * 1) Handcrafted demo sandbox tenant
 * 2) vyron_workspaces.company_id for the active workspace
 * 3) Active client cookie companyId (legacy / local clients without DB workspace row)
 *
 * Never uses workspace.id as company_id.
 */
export async function getWorkspaceCompanyId(): Promise<string | null> {
  const client = await getServerActiveWorkspace();
  const resolution = await resolveActiveWorkspaceCompanyId(client);
  if (resolution.companyId) return resolution.companyId;

  // Fallback for sessions where active-client cookie is unavailable but
  // workspace session cookie still carries canonical company scope.
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const raw = cookieStore.get(WORKSPACE_SESSION_KEY)?.value;
    const parsed = parseCookieJsonValue<Parameters<typeof expandWorkspaceSessionFromCookie>[0]>(raw);
    const session = parsed ? expandWorkspaceSessionFromCookie(parsed) : null;
    const cookieCompanyId = session?.companyId?.trim() || null;
    return isUuid(cookieCompanyId) ? cookieCompanyId : null;
  } catch {
    return null;
  }
}

export async function getWorkspaceCompanyResolution() {
  const client = await getServerActiveWorkspace();
  return resolveActiveWorkspaceCompanyId(client);
}

export async function getWorkspaceTenantId(): Promise<string | null> {
  const client = await getServerActiveWorkspace();
  if (!client || !isDemoWorkspace(client)) return null;
  return HANDCRAFTED_COMPANY_ID;
}
