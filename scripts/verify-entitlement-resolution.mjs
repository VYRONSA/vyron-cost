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

import { resolveCompanyPackage, SYSTEM_DEFAULT_PACKAGE } from "../src/lib/platform/entitlement/EntitlementService.ts";

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
