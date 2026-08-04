import protectedTenants from "../../data/protected-tenants.json";

/**
 * PCP-047 — tenants that may never be deleted.
 *
 * The same list backs the CLI (scripts/cleanup-test-tenants.mjs) and the
 * Developer Centre. Both read data/protected-tenants.json, so the protection
 * cannot drift between the two paths. Company IDs, not workspace IDs.
 */

export type ProtectedTenant = {
  companyId: string;
  name: string;
  reason: string;
};

export const PROTECTED_TENANTS: ProtectedTenant[] = protectedTenants.protectedCompanyIds;

const PROTECTED_IDS = new Set(PROTECTED_TENANTS.map((t) => t.companyId));

export function isProtectedCompany(companyId: string | null | undefined): boolean {
  return Boolean(companyId && PROTECTED_IDS.has(companyId));
}

export function protectedReason(companyId: string | null | undefined): string | null {
  if (!companyId) return null;
  return PROTECTED_TENANTS.find((t) => t.companyId === companyId)?.reason ?? null;
}
