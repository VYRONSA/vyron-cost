import type { ActiveClient } from "@/lib/vyron-developer-client";
import { hasMultiStorePackage, hasFeature } from "@/platform/managers/package-manager";
import type { PlatformTenant } from "@/platform/types";
import {
  getServerActiveWorkspace,
  getWorkspaceCompanyId,
  getWorkspaceCompanyResolution,
  getWorkspaceTenantId,
} from "@/lib/vyron-workspace-server";

export type TenantResolution = Awaited<ReturnType<typeof getWorkspaceCompanyResolution>>;

function mapClientToTenant(client: ActiveClient | null): PlatformTenant {
  const packageName = client?.packageName || "Professional";
  return {
    workspaceId: client?.id || null,
    companyId: client?.companyId || null,
    companyName: client?.companyName || "Workspace",
    tradingName: client?.tradingName || client?.companyName || "Workspace",
    packageName,
    status: client?.status || "Setup",
    demoMode: Boolean(client?.demoMode),
    // ⚠ DISPLAY ONLY. These flags are derived from the cookie's packageName and
    // must never gate access. For an entitlement decision use
    // `companyHasFeature(companyId, feature)` from "@/lib/platform/entitlement".
    // See docs/ARCHITECTURE/ENTITLEMENT-SERVICE.md.
    multiCompany: hasFeature(packageName, "multi_company"),
    multiStore: hasMultiStorePackage(packageName) || hasFeature(packageName, "multi_store"),
  };
}

export async function resolveTenant(): Promise<PlatformTenant> {
  const client = await getServerActiveWorkspace();
  const resolution = await getWorkspaceCompanyResolution();
  const tenant = mapClientToTenant(client);
  if (resolution.companyId && !tenant.companyId) {
    tenant.companyId = resolution.companyId;
  }
  if (resolution.workspaceId && !tenant.workspaceId) {
    tenant.workspaceId = resolution.workspaceId;
  }
  return tenant;
}

export function resolveTenantFromClient(client: ActiveClient | null): PlatformTenant {
  return mapClientToTenant(client);
}

export async function resolveCompanyId(): Promise<string | null> {
  return getWorkspaceCompanyId();
}

export async function resolveTenantId(): Promise<string | null> {
  return getWorkspaceTenantId();
}

export async function resolveTenantWithSource() {
  const [tenant, resolution] = await Promise.all([resolveTenant(), getWorkspaceCompanyResolution()]);
  return { tenant, resolution };
}

/** Single approved API entry point for company_id resolution. */
export {
  requireApiCompanyId as requireTenantCompanyId,
  resolveAndAlignApiCompanyId as alignTenantCompanyId,
  resolveApiCompanyId,
  requireWorkspaceContext,
} from "@/lib/vyron-api-workspace";
