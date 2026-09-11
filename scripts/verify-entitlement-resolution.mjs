#!/usr/bin/env node
/**
 * VYRON — Platform Entitlement Service regression test.
 *
 * PROVES THE DATABASE IS AUTHORITATIVE AND THE COOKIE IS NOT.
 *
 * This test exists because entitlement was once taken from the
 * `vyron_cost_active_client` browser cookie, which silently changed a paying
 * customer's licensed limits and let client-controlled state decide licensing.
 * The two headline cases below must never regress:
 *
 *   Database = Professional, Cookie = Starter     -> Professional
 *   Database = Starter,      Cookie = Enterprise  -> Starter
 *
 * Family A under the Repository Safety Programme: no database, no credentials,
 * no network. The Supabase client is injected, so this exercises the shipped
 * resolution logic directly.
 *
 *   node scripts/verify-entitlement-resolution.mjs
 *
 * Exits 0 on pass, 1 on failure.
 */

import { register } from "node:module";
import { resolveCompanyPackage, SYSTEM_DEFAULT_PACKAGE } from "../src/lib/platform/entitlement/EntitlementService.ts";

// Resolves the "@/..." imports of the package and AI modules checked below.
register("./support/migration-hook.mjs", import.meta.url);

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Minimal Supabase stand-in.
 * @param workspaces rows for vyron_workspaces, or "error"
 * @param companyPlan value for vyron_cost_companies.subscription_plan, or "error"
 */
function fakeClient(workspaces, companyPlan) {
  return {
    from(table) {
      if (table === "vyron_workspaces") {
        return {
          select() {
            return {
              eq() {
                if (workspaces === "error") return Promise.resolve({ data: null, error: { message: "boom" } });
                return Promise.resolve({ data: workspaces, error: null });
              },
            };
          },
        };
      }
      if (table === "vyron_cost_companies") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle() {
                    if (companyPlan === "error") return Promise.resolve({ data: null, error: { message: "boom" } });
                    return Promise.resolve({ data: { subscription_plan: companyPlan }, error: null });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const ws = (packageName, status = "Live", id = "ws-1") => [{ id, package_name: packageName, status }];

// ─── THE TWO CASES THAT MUST NEVER REGRESS ─────────────────────────────────
const case1 = await resolveCompanyPackage("c1", {
  client: fakeClient(ws("Professional"), "Professional"),
  fallbackPackageName: "Starter", // the cookie
});
check("DB=Professional + Cookie=Starter resolves Professional", case1.packageName === "Professional", case1.packageName);
check("  ...and the source is the workspace record", case1.source === "workspace.package_name", case1.source);

const case2 = await resolveCompanyPackage("c2", {
  client: fakeClient(ws("Starter"), "Starter"),
  fallbackPackageName: "Enterprise", // the cookie
});
check("DB=Starter + Cookie=Enterprise resolves Starter", case2.packageName === "Starter", case2.packageName);
check("  ...and the source is the workspace record", case2.source === "workspace.package_name", case2.source);

// A cookie must never upgrade OR downgrade. Both directions, every tier pair.
const TIERS = ["Starter", "Professional", "Enterprise", "Multi-Store Operations"];
for (const dbTier of TIERS) {
  for (const cookieTier of TIERS) {
    const result = await resolveCompanyPackage("c", {
      client: fakeClient(ws(dbTier), dbTier),
      fallbackPackageName: cookieTier,
    });
    check(`DB=${dbTier} beats Cookie=${cookieTier}`, result.packageName === dbTier, result.packageName);
  }
}

// ─── Canonical source precedence ───────────────────────────────────────────
const precedence = await resolveCompanyPackage("c3", {
  client: fakeClient(ws("Enterprise"), "Starter"),
  fallbackPackageName: "Professional",
});
check("workspace.package_name beats company.subscription_plan", precedence.packageName === "Enterprise", precedence.packageName);
check("divergence is reported, not absorbed", precedence.divergence !== null);
check("divergence names both values", precedence.divergence.workspacePackage === "Enterprise" && precedence.divergence.companyPlan === "Starter");

const noDivergence = await resolveCompanyPackage("c4", { client: fakeClient(ws("Professional"), "Professional") });
check("matching records report no divergence", noDivergence.divergence === null);

// ─── Fallback ladder ───────────────────────────────────────────────────────
const noWorkspace = await resolveCompanyPackage("c5", { client: fakeClient([], "Enterprise"), fallbackPackageName: "Starter" });
check("no workspace row falls back to subscription_plan", noWorkspace.packageName === "Enterprise", noWorkspace.packageName);
check("  ...and records that source", noWorkspace.source === "company.subscription_plan", noWorkspace.source);

const blankWorkspacePackage = await resolveCompanyPackage("c6", { client: fakeClient(ws("   "), "Enterprise") });
check("blank workspace package falls through to subscription_plan", blankWorkspacePackage.packageName === "Enterprise", blankWorkspacePackage.packageName);

const neither = await resolveCompanyPackage("c7", { client: fakeClient([], null), fallbackPackageName: "Starter" });
check("cookie is used ONLY when the database has nothing", neither.packageName === "Starter", neither.packageName);
check("  ...and that is recorded honestly as a fallback", neither.source === "caller-supplied-fallback", neither.source);

const nothingAtAll = await resolveCompanyPackage("c8", { client: fakeClient([], null) });
check("no database value and no cookie yields the system default", nothingAtAll.packageName === SYSTEM_DEFAULT_PACKAGE, nothingAtAll.packageName);
check("  ...recorded as system-default", nothingAtAll.source === "system-default", nothingAtAll.source);

// ─── Failure modes fail OPEN, never to a zero-limit tier ───────────────────
const dbError = await resolveCompanyPackage("c9", { client: fakeClient("error", "error"), fallbackPackageName: "Professional" });
check("database error does not resolve Starter", dbError.packageName !== "Starter", dbError.packageName);
check("database error falls back to the caller value", dbError.packageName === "Professional", dbError.packageName);

const noClient = await resolveCompanyPackage("c10", { client: null, fallbackPackageName: "Enterprise" });
check("no client returns the fallback without throwing", noClient.packageName === "Enterprise", noClient.packageName);

const noCompanyId = await resolveCompanyPackage("", { client: fakeClient(ws("Starter"), "Starter") });
check("empty companyId never resolves a real package", noCompanyId.packageName === SYSTEM_DEFAULT_PACKAGE, noCompanyId.packageName);

// ─── Workspace selection ───────────────────────────────────────────────────
const multi = await resolveCompanyPackage("c11", {
  client: fakeClient(
    [
      { id: "ws-archived", package_name: "Starter", status: "Archived" },
      { id: "ws-live", package_name: "Enterprise", status: "Live" },
    ],
    null
  ),
});
check("a Live workspace is preferred over an Archived one", multi.packageName === "Enterprise", multi.packageName);
check("the chosen workspace id is reported", multi.workspaceId === "ws-live", String(multi.workspaceId));

const setupOnly = await resolveCompanyPackage("c12", { client: fakeClient(ws("Professional", "Setup"), null) });
check("a Setup workspace is still a valid licence", setupOnly.packageName === "Professional", setupOnly.packageName);
check("workspace status is reported for licensing decisions", setupOnly.workspaceStatus === "Setup", String(setupOnly.workspaceStatus));

const suspended = await resolveCompanyPackage("c13", { client: fakeClient(ws("Enterprise", "Suspended"), null) });
check("suspended workspace status is surfaced, not hidden", suspended.workspaceStatus === "Suspended", String(suspended.workspaceStatus));

// ─── Package model: Full, and every existing package unchanged ─────────────
const pm = await import("../src/platform/managers/package-manager.ts");
const ai = await import("../src/lib/platform/ai/AiTierEnforcement.ts");
const ctx = await import("../src/lib/vyron-workspace-context.ts");
const sorted = (values) => [...values].sort().join(",");

const STARTER_F = ["dashboard", "contacts", "customers", "suppliers", "ingredients", "finished_goods", "recipes", "import_centre", "reports"];
const PROFESSIONAL_F = [...STARTER_F, "inventory", "procurement", "purchase_orders", "manufacturing", "xero_sync", "supplier_intelligence", "document_intelligence", "customer_invoices"];
const ENTERPRISE_F = [...PROFESSIONAL_F, "forecasting", "cost_intelligence", "advanced_dashboards", "multi_company", "integrations", "developer_tools"];
const MULTI_STORE_F = ["multi_store", "store_ordering", "stores", "store_performance", "dispatch_board", "production_planning", "store_forecasting"];
const SUMMARY_STARTER = ["Dashboard", "Suppliers", "Ingredients", "Products", "Recipes", "Basic reports"];
const SUMMARY_PRO = ["Dashboard", "Suppliers", "Costing", "Procurement", "Inventory", "Manufacturing", "Customers", "Xero"];
const SUMMARY_ENT = ["All modules", "Advanced intelligence", "Multi-company", "API/integrations"];

check("the platform recognises exactly 30 features", pm.FEATURE_KEYS.length === 30, String(pm.FEATURE_KEYS.length));
check("the tier lists above cover all 30 features", sorted([...ENTERPRISE_F, ...MULTI_STORE_F]) === sorted(pm.FEATURE_KEYS));

// Full
const fullFeatures = pm.resolveWorkspaceFeatures("Full");
check("Full grants all 30 features", sorted(fullFeatures) === sorted(pm.FEATURE_KEYS), sorted(fullFeatures));
for (const feature of MULTI_STORE_F) check(`Full includes ${feature}`, pm.hasFeature("Full", feature));
for (const feature of ["integrations", "developer_tools", "forecasting", "cost_intelligence", "advanced_dashboards", "multi_company", "xero_sync", "manufacturing"]) {
  check(`Full includes ${feature}`, pm.hasFeature("Full", feature));
}
check("Full's base tier is Enterprise", pm.resolveBasePackageId("Full") === "enterprise", pm.resolveBasePackageId("Full"));
check("Full resolves to the full package id", pm.resolvePackageId("Full") === "full", pm.resolvePackageId("Full"));
check("Full does not resolve to Professional", pm.resolvePackageId("Full") !== "professional" && pm.resolveBasePackageId("Full") !== "professional");
check("Full does not resolve to Starter", pm.resolvePackageId("Full") !== "starter" && pm.resolveBasePackageId("Full") !== "starter");
check("Full is an explicit rule, not the multi-store name rule", pm.hasMultiStorePackage("Full") === false);
const fullAi = ai.resolveTierAllowance("Full");
check(
  "Full AI allowance: 5,000 credits, 10,000 requests, $250 cap",
  fullAi.packageId === "full" && fullAi.monthlyCredits === 5000 && fullAi.maxRequests === 10000 && fullAi.maxSpendUsd === 250,
  JSON.stringify(fullAi)
);
check("Full module summary: All modules, including Multi-Store", pm.packageModuleSummary("Full")[0] === "All modules" && pm.packageModuleSummary("Full").includes("Multi-Store Operations"));
check("packageIncludesFeature('full') covers every feature", pm.FEATURE_KEYS.every((feature) => pm.packageIncludesFeature("full", feature)));
check("Full upgrade label names Full", pm.getUpgradeMessage("Full", "dashboard").includes("on Full"));
check("Full is a known package name", pm.isKnownPackageName("Full"));
check("public pricing is unchanged (Full is not listed)", !pm.getPackageComparisonRows().some((row) => row.packageId === "full") && pm.getPackageDefinitions().length === 4);
const clientWith = (packageName) => ({ id: "ws-qa", companyName: "QA", tradingName: "QA", packageName, status: "Setup" });
check("Full is not demo mode", ctx.isDemoWorkspace(clientWith("Full")) === false);

// Existing packages — every value below is the behaviour before Full existed.
const EXISTING = {
  Starter: { base: "starter", id: "starter", features: STARTER_F, credits: 0, summary: SUMMARY_STARTER, demo: false },
  Professional: { base: "professional", id: "professional", features: PROFESSIONAL_F, credits: 500, summary: SUMMARY_PRO, demo: false },
  Enterprise: { base: "enterprise", id: "enterprise", features: ENTERPRISE_F, credits: 2500, summary: SUMMARY_ENT, demo: false },
  Demo: { base: "professional", id: "professional", features: PROFESSIONAL_F, credits: 500, summary: SUMMARY_PRO, demo: true },
  "Professional Demo": { base: "professional", id: "professional", features: PROFESSIONAL_F, credits: 500, summary: SUMMARY_PRO, demo: true },
  // Includes its known, separately reported base-tier defect (Professional, not Enterprise).
  "Multi-Store Operations": { base: "professional", id: "multi_store_operations", features: [...PROFESSIONAL_F, ...MULTI_STORE_F], credits: 5000, summary: SUMMARY_STARTER, demo: false },
};
for (const [name, want] of Object.entries(EXISTING)) {
  check(`${name}: base tier unchanged`, pm.resolveBasePackageId(name) === want.base, pm.resolveBasePackageId(name));
  check(`${name}: allowance id unchanged`, pm.resolvePackageId(name) === want.id, pm.resolvePackageId(name));
  check(`${name}: features unchanged`, sorted(pm.resolveWorkspaceFeatures(name)) === sorted(want.features), sorted(pm.resolveWorkspaceFeatures(name)));
  check(`${name}: AI allowance unchanged`, ai.resolveTierAllowance(name).monthlyCredits === want.credits, String(ai.resolveTierAllowance(name).monthlyCredits));
  check(`${name}: module summary unchanged`, sorted(pm.packageModuleSummary(name)) === sorted(want.summary));
  check(`${name}: demo mode unchanged`, ctx.isDemoWorkspace(clientWith(name)) === want.demo);
}
check("the five dropdown packages and Full are the known names", sorted(pm.KNOWN_PACKAGE_NAMES) === sorted(["Starter", "Professional", "Enterprise", "Demo", "Professional Demo", "Full"]));

// Exact matching — nothing else is ever Full; unknown names behave as before.
const unknownFeatures = sorted(pm.resolveWorkspaceFeatures("Gold"));
check("an unknown name still resolves as Professional", pm.resolveBasePackageId("Gold") === "professional" && unknownFeatures === sorted(PROFESSIONAL_F));
check("an unknown name is not a known package", !pm.isKnownPackageName("Gold"));
for (const name of ["full", "FULL", "Full ", " Full", "Full Package", "Fullerton", "Full Demo", ""]) {
  const label = JSON.stringify(name);
  check(`${label} is not Full`, !pm.isFullPackage(name) && pm.resolvePackageId(name) !== "full" && pm.resolveWorkspaceFeatures(name).size !== 30);
  check(`${label} is not a known package name`, !pm.isKnownPackageName(name));
}
for (const name of ["full", "FULL", "Full "]) {
  check(`${JSON.stringify(name)} behaves exactly as an unknown name (Professional)`, sorted(pm.resolveWorkspaceFeatures(name)) === unknownFeatures && ai.resolveTierAllowance(name).monthlyCredits === 500);
}

// ─── Result ────────────────────────────────────────────────────────────────
const rule = "-".repeat(74);
process.stdout.write(`\n${rule}\n  VYRON — PLATFORM ENTITLEMENT SERVICE REGRESSION TEST\n${rule}\n`);
process.stdout.write(`  Passed: ${passed}\n  Failed: ${failures.length}\n`);
if (failures.length) {
  process.stdout.write(`${rule}\n`);
  for (const failure of failures) process.stdout.write(`  FAIL  ${failure}\n`);
}
process.stdout.write(`${rule}\n  ${failures.length ? "REGRESSION TEST FAILED" : "REGRESSION TEST PASSED"}\n${rule}\n\n`);
process.exit(failures.length ? 1 : 0);
