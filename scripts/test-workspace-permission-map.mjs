#!/usr/bin/env node
/**
 * VOLORA — saved permission maps layer over role defaults; they never erase them.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN (found by local browser QA, 2026-09-29)
 * ------------------------------------------------------------------------
 * normalizePermissionMap() started from EVERY permission key set to false and
 * then applied the saved entries. resolveEffectivePermissions() merges that
 * over the role's defaults, so a member whose saved map was partial — e.g.
 * { "reports.export": false } — lost every view and edit permission the role
 * grants, although only one key had been saved. The code comment said the
 * opposite ("so sparse DB permission rows do not strip standard view access").
 *
 * Now an absent key keeps the role's value; an explicit true or false wins.
 *
 * Family A: pure computation.
 *
 *   npm run test:workspace-permission-map
 */
import { register } from "node:module";

register("./support/ts-alias-hook.mjs", import.meta.url);
const perms = await import("../src/lib/vyron-workspace-permissions.ts");

let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  } else console.log(`  ok   ${name}`);
};

const role = "SALES";
const defaults = perms.resolveEffectivePermissions(role, {});
const keys = Object.keys(defaults);
check("SALES defaults grant the keys under test", defaults["sales_orders.view"] === true && defaults["sales_orders.edit"] === true && defaults["reports.view"] === true && defaults["reports.export"] === false);

console.log("\n1. complete saved map");
{
  const complete = { ...defaults, "reports.export": true, "sales_orders.edit": false };
  const eff = perms.resolveEffectivePermissions(role, complete);
  check("every key follows the saved map exactly", keys.every((k) => eff[k] === complete[k]), keys.filter((k) => eff[k] !== complete[k]).join(","));
}

console.log("\n2. partial saved map");
{
  const eff = perms.resolveEffectivePermissions(role, { "reports.export": true });
  const changed = keys.filter((k) => k !== "reports.export" && eff[k] !== defaults[k]);
  check("only the saved key changes; every other key keeps the role default", changed.length === 0 && eff["reports.export"] === true, changed.join(","));
}

console.log("\n3. explicit false override (the example from the defect)");
{
  const managerDefaults = perms.resolveEffectivePermissions("MANAGER", {});
  const eff = perms.resolveEffectivePermissions("MANAGER", { "reports.export": false });
  check("MANAGER grants reports.export by default", managerDefaults["reports.export"] === true);
  check("saved reports.export = false denies it", eff["reports.export"] === false);
  check("reports.view stays true", eff["reports.view"] === true);
  check("sales_orders.view stays true", eff["sales_orders.view"] === true);
  const eff2 = perms.resolveEffectivePermissions(role, { "sales_orders.edit": false });
  check("an explicit deny of a role-granted key still denies it", eff2["sales_orders.edit"] === false && eff2["sales_orders.view"] === true);
}

console.log("\n4. explicit true override");
{
  const eff = perms.resolveEffectivePermissions("VIEW_ONLY", { "sales_orders.edit": true });
  check("VIEW_ONLY + saved sales_orders.edit = true grants it", eff["sales_orders.edit"] === true);
  check("…and keeps VIEW_ONLY's views", eff["reports.view"] === true && eff["customers.view"] === true);
  check("…without granting anything else", eff["sales_orders.approve"] === false && eff["reports.export"] === false);
}

console.log("\n5. missing key retains the role default");
{
  for (const r of ["SUPERVISOR", "MANAGER", "PROCUREMENT", "PRODUCTION", "INVENTORY", "SALES", "VIEW_ONLY"]) {
    const base = perms.resolveEffectivePermissions(r, {});
    const eff = perms.resolveEffectivePermissions(r, { "dashboard.view": base["dashboard.view"] });
    check(`${r}: a map saving one unchanged key equals the role defaults`, keys.every((k) => eff[k] === base[k]), keys.filter((k) => eff[k] !== base[k]).slice(0, 5).join(","));
  }
}

console.log("\nnormalizePermissionMap itself");
{
  check("returns only the saved keys", JSON.stringify(perms.normalizePermissionMap({ "reports.export": false })) === JSON.stringify({ "reports.export": false }));
  check("empty / null input → empty map", Object.keys(perms.normalizePermissionMap({})).length === 0 && Object.keys(perms.normalizePermissionMap(null)).length === 0);
  check("unknown keys are dropped", Object.keys(perms.normalizePermissionMap({ "not.a.permission": true })).length === 0);
  check("legacy keys are mapped to current keys", perms.normalizePermissionMap({ view_reports: false })["reports.view"] === false);
  check("values are made boolean", perms.normalizePermissionMap({ "reports.view": 1 })["reports.view"] === true);
  check("a complete map round-trips unchanged", JSON.stringify(perms.normalizePermissionMap(defaults)) === JSON.stringify(defaults));
  check("OWNER is still full access regardless of saved entries", Object.values(perms.resolveEffectivePermissions("OWNER", { "reports.view": false })).every(Boolean));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
