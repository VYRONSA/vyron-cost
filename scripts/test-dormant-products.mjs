#!/usr/bin/env node
/** Dormant product rule + route guards (source checks).  npm run test:dormant-products */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const { classifyDormant } = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-dormant-products.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };
const T = "2026-11-10";

check("sold 100 days ago is dormant at 90 days", classifyDormant({ lastSaleDate: "2026-08-02", lastMovementAt: null, createdAt: "2025-01-01" }, T, 90).dormant);
check("sold 30 days ago is not dormant", !classifyDormant({ lastSaleDate: "2026-10-11", lastMovementAt: null, createdAt: "2025-01-01" }, T, 90).dormant);
check("old sale but recent stock movement is not dormant", !classifyDormant({ lastSaleDate: "2026-01-01", lastMovementAt: "2026-11-01T10:00:00Z", createdAt: "2025-01-01" }, T, 90).dormant);
const c = classifyDormant({ lastSaleDate: "2026-01-01", lastMovementAt: "2026-03-01T10:00:00Z", createdAt: "2025-01-01" }, T, 90);
check("last activity is the later of sale and movement", c.lastActivity === "2026-03-01" && c.daysSinceActivity === 254, JSON.stringify(c));
check("never used and created long ago is dormant", classifyDormant({ lastSaleDate: null, lastMovementAt: null, createdAt: "2026-01-01" }, T, 90).dormant);
check("never used but created last week is not dormant", !classifyDormant({ lastSaleDate: null, lastMovementAt: null, createdAt: "2026-11-03" }, T, 90).dormant);
check("exactly 90 days counts as dormant", classifyDormant({ lastSaleDate: "2026-08-12", lastMovementAt: null, createdAt: null }, T, 90).dormant);

const route = readFileSync(path.join(ROOT, "src/app/api/products/dormant/route.ts"), "utf8");
check("actions require products.delete", route.includes('requireWorkspacePermission("products.delete")'));
check("listing requires products.view", route.includes('requireWorkspacePermission("products.view")'));
check("server refuses a product that is not dormant", /if \(!row\.dormant\)[\s\S]{0,200}409/.test(route));
check("server refuses a product with stock on hand", /row\.qtyOnHand !== 0[\s\S]{0,300}409/.test(route));
check("removal goes through deleteProduct (reference-protected)", route.includes("deleteProduct(supabase, companyId, productId, { mode: action })"));
check("every action is audited with the member's name", route.includes("writeInventoryAudit") && route.includes("memberDisplayName"));
check("company comes from the session, never the body", route.includes("requireApiCompanyId()") && !/body\.company/i.test(route));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
