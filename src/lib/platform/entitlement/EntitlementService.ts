/**
 * VYRON — Platform Entitlement Service.
 *
 * THE SINGLE AUTHORITATIVE SOURCE OF PACKAGE ENTITLEMENT FOR EVERY VYRON
 * PRODUCT. No other module may resolve a package independently.
 *
 * Previously `src/lib/platform/ai/AiEntitlementResolver.ts`. It was never
 * AI-specific — AI allowance was simply the first consumer. It now serves AI
 * allowance, server-side feature gating, and the limit surfaces listed under
 * "extension points" below.
 *
 * WHY IT EXISTS
 * -------------
 * Entitlement was previously taken from the `vyron_cost_active_client` browser
 * cookie via `resolveSubscription()` -> `getServerActiveWorkspace()` ->
 * `cookies()` -> `parseActiveClient`. The database was never consulted. That
 * was both a correctness defect (a stale cookie silently changed a customer's
 * licensed limits) and a trust-boundary defect (client-controlled state decided
 * licensing).
 *
 * TRUST BOUNDARY — the rule this module exists to enforce
 * -------------------------------------------------------
 *   A browser cookie, localStorage value, request header or request body is
 *   NEVER authoritative for licensing, entitlement, limits or feature access.
 *   It may be used for UI convenience only.
 *
 * CANONICAL SOURCE — `vyron_workspaces.package_name`
 * --------------------------------------------------
 * `vyron_cost_companies.subscription_plan` is a FALLBACK only, for companies
 * with no workspace row. See docs/ARCHITECTURE/ENTITLEMENT-SERVICE.md for the
 * full rationale. Divergence between the two is detected and reported, never
 * silently absorbed.
 *
 * TESTABILITY
 * -----------
 * The Supabase client is injectable and the `@/lib/supabase-server` import is
 * dynamic, so the resolution logic can be exercised with no database, no
 * credentials and no path-alias resolution. See
 * `scripts/verify-entitlement-resolution.mjs`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EntitlementSource =
  | "workspace.package_name"
  | "company.subscription_plan"
  | "caller-supplied-fallback"
  | "system-default";

export type CompanyPackageResolution = {
  companyId: string;
  packageName: string;
  source: EntitlementSource;
  workspaceId: string | null;
  /** Workspace lifecycle status from the database, e.g. Live / Setup / Suspended / Archived. */
  workspaceStatus: string | null;
  /** Set when the workspace and company records disagree. Never silently resolved. */
  divergence: { workspacePackage: string; companyPlan: string } | null;
};

export type ResolveOptions = {
  /**
   * Last-resort value used only when the database yields no package at all.
   * Callers pass the cookie's package here; it is NEVER preferred over a
   * database value.
   */
  fallbackPackageName?: string | null;
  /** Injected Supabase client. Omit in application code. */
  client?: SupabaseClient | null;
};

/**
 * Default applied only when neither database record yields a package AND the
 * caller supplied no fallback. Matches the historic behaviour of
 * `resolveSubscriptionFromClient`, which also defaults to "Professional".
 *
 * Failing OPEN is deliberate here: the alternative refuses service to paying
 * customers because of an infrastructure fault. Entitlement is a commercial
 * boundary, not a security boundary — authentication and permissions, which
 * fail closed, are enforced separately and before this runs.
 */
export const SYSTEM_DEFAULT_PACKAGE = "Professional";

/** Workspace statuses representing a live licence, most-preferred first. */
const ACTIVE_WORKSPACE_STATUSES = ["Live", "Active", "Setup", "Demo"];

/**
 * `undefined` means "not supplied — use the application client".
 * An explicit `null` means "no client is available", which callers and tests
 * use to exercise the degraded path without loading application modules.
 */
async function resolveAdminClient(options: ResolveOptions): Promise<SupabaseClient | null> {
  if (options.client !== undefined) return options.client;
  // Dynamic so this module can be loaded without the "@/" alias resolver.
  const { getSupabaseAdmin, isSupabaseServiceRoleConfigured } = await import("@/lib/supabase-server");
  if (!isSupabaseServiceRoleConfigured()) return null;
  return getSupabaseAdmin();
}

/**
 * Resolve the licensed package for a company, from the database only.
 *
 * Never reads cookies, headers, localStorage or any request-scoped client
 * state. The only client-supplied value it accepts is `fallbackPackageName`,
 * which is used solely when the database returns nothing.
 */
export async function resolveCompanyPackage(
  companyId: string,
  options: ResolveOptions = {}
): Promise<CompanyPackageResolution> {
  const fallback = options.fallbackPackageName?.trim() || null;
  const base: CompanyPackageResolution = {
    companyId,
    packageName: fallback || SYSTEM_DEFAULT_PACKAGE,
    source: fallback ? "caller-supplied-fallback" : "system-default",
    workspaceId: null,
    workspaceStatus: null,
    divergence: null,
  };

  const supabase = await resolveAdminClient(options);
  if (!supabase || !companyId) return base;

  let workspacePackage: string | null = null;
  let workspaceId: string | null = null;
  let workspaceStatus: string | null = null;
  let companyPlan: string | null = null;

  // 1 — canonical: vyron_workspaces.package_name
  const workspaces = await supabase
    .from("vyron_workspaces")
    .select("id, package_name, status")
    .eq("company_id", companyId);

  if (!workspaces.error && workspaces.data?.length) {
    const rows = workspaces.data as Array<{ id: string; package_name: string | null; status: string | null }>;
    const rank = (status: string | null) => {
      const index = ACTIVE_WORKSPACE_STATUSES.indexOf(String(status || ""));
      return index === -1 ? ACTIVE_WORKSPACE_STATUSES.length : index;
    };
    const ranked = [...rows].sort((a, b) => rank(a.status) - rank(b.status));
    const chosen = ranked.find((row) => String(row.package_name || "").trim()) || ranked[0];
    if (chosen) {
      workspaceId = String(chosen.id);
      workspaceStatus = chosen.status ? String(chosen.status) : null;
      const value = String(chosen.package_name || "").trim();
      if (value) workspacePackage = value;
    }
  }

  // 2 — fallback source: vyron_cost_companies.subscription_plan
  const company = await supabase
    .from("vyron_cost_companies")
    .select("subscription_plan")
    .eq("id", companyId)
    .maybeSingle();

  if (!company.error && company.data) {
    const value = String((company.data as { subscription_plan: string | null }).subscription_plan || "").trim();
    if (value) companyPlan = value;
  }

  const divergence =
    workspacePackage && companyPlan && workspacePackage.toLowerCase() !== companyPlan.toLowerCase()
      ? { workspacePackage, companyPlan }
      : null;

  if (divergence) {
    console.warn(
      `[entitlement] package divergence for company ${companyId}: workspace="${divergence.workspacePackage}" company="${divergence.companyPlan}". Using the workspace value.`
    );
  }

  if (workspacePackage) {
    return { companyId, packageName: workspacePackage, source: "workspace.package_name", workspaceId, workspaceStatus, divergence };
  }
  if (companyPlan) {
    return { companyId, packageName: companyPlan, source: "company.subscription_plan", workspaceId, workspaceStatus, divergence };
  }

  return { ...base, workspaceId, workspaceStatus, divergence };
}

/**
 * Does this company's licensed package include a feature?
 *
 * The gating helper every server-side caller should use. `hasFeature` is
 * imported dynamically for the same alias-free-loading reason as above.
 */
export async function companyHasFeature(
  companyId: string,
  feature: string,
  options: ResolveOptions = {}
): Promise<{ allowed: boolean; resolution: CompanyPackageResolution }> {
  const resolution = await resolveCompanyPackage(companyId, options);
  const { hasFeature } = await import("@/platform/managers/package-manager");
  return {
    allowed: hasFeature(resolution.packageName, feature as Parameters<typeof hasFeature>[1]),
    resolution,
  };
}

export type ProductLicence = {
  valid: boolean;
  productId: string;
  packageName: string;
  reason: string | null;
  resolution: CompanyPackageResolution;
};

/** Workspace lifecycle statuses that void a licence. */
const VOIDING_WORKSPACE_STATUSES = ["Suspended", "Archived"];

/**
 * Is a company licensed for a VYRON product?
 *
 * Replaces `platform/managers/licensing-manager.ts`, which was removed. That
 * module took `PlatformTenant` and `PlatformSubscription` as parameters — both
 * built from the `vyron_cost_active_client` cookie by `resolveTenant()` and
 * `resolveSubscription()`. It had no callers, but it encoded the cookie-based
 * pattern this architecture removed, and a future caller would have
 * reintroduced the defect.
 *
 * The decision logic is preserved verbatim; only the inputs changed. It now
 * takes a `companyId` and resolves everything from the database, so the same
 * check cannot be made against client-supplied state.
 */
export async function resolveProductLicence(
  companyId: string,
  productId: string,
  options: ResolveOptions = {}
): Promise<ProductLicence> {
  const resolution = await resolveCompanyPackage(companyId, options);
  const deny = (reason: string): ProductLicence => ({
    valid: false,
    productId,
    packageName: resolution.packageName,
    reason,
    resolution,
  });

  const { getProductDefinition } = await import("@/platform/products/registry");
  const product = getProductDefinition(productId as Parameters<typeof getProductDefinition>[0]);
  if (!product) return deny("Unknown VYRON product.");
  if (product.status === "planned") return deny(`${product.name} is not yet activated for this workspace.`);

  if (resolution.workspaceStatus && VOIDING_WORKSPACE_STATUSES.includes(resolution.workspaceStatus)) {
    return deny("Workspace license is suspended or archived.");
  }

  const { hasFeature } = await import("@/platform/managers/package-manager");
  if (!hasFeature(resolution.packageName, "dashboard")) {
    return deny("Package does not include platform access.");
  }

  return { valid: true, productId, packageName: resolution.packageName, reason: null, resolution };
}

/**
 * EXTENSION POINTS — the limit surfaces this service will own.
 *
 * Each is currently resolved elsewhere or not yet implemented. They are named
 * here so that when they are built, they are built in one place rather than
 * re-deriving a package independently:
 *
 *   - AI allowance          IMPLEMENTED, consumed by AiUsageService
 *   - Feature gating        IMPLEMENTED, consumed by requirePackageFeature
 *   - User limits           TODO — currently vyron_workspaces.user_limit, read ad hoc
 *   - Storage limits        TODO — no enforcement exists
 *   - API rate limits       TODO — no enforcement exists
 *   - Billing limits        TODO
 *   - Product licensing     TODO — multi-product entitlement across the VYRON registry
 *
 * See docs/ARCHITECTURE/ENTITLEMENT-SERVICE.md.
 */
