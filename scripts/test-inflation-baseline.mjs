#!/usr/bin/env node
/**
 * Historical inflation baseline (pure): exclusion of pre-baseline rows, re-based inflation, items
 * with no reliable basis, impact summary.
 *   npm run test:inflation-baseline
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const m = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-inflation-baseline.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };

let n = 0;
const row = (entity, date, prev, price, extra = {}) => ({
  id: `r${++n}`, entity_type: "ingredient", entity_id: entity, entity_name: `Item ${entity}`, item_description: null, supplier_name: "Gourmet",
  invoice_number: `INV-${n}`, invoice_date: date, created_at: `${date}T09:00:00Z`, previous_price: prev, new_price: price, change_percent: null, ...extra,
});

const rows = [
  // Flour: wrong pre-October cost 10 (should have been ~20), then real prices 20 -> 22
  row("flour", "2026-08-15", null, 10),
  row("flour", "2026-10-05", 10, 20),
  row("flour", "2026-11-03", 20, 22),
  // Butter: only bought before the baseline
  row("butter", "2026-07-01", null, 50),
  row("butter", "2026-09-01", 50, 55),
  // Salt: one purchase since baseline
  row("salt", "2026-10-20", 4, 5),
  // Sugar: only post-baseline history
  row("sugar", "2026-10-02", null, 30),
  row("sugar", "2026-11-01", 30, 33),
];
const r = m.buildInflationReview(rows, "2026-10-01");
const it = (id) => r.items.find((i) => i.entityId === id);

console.log("re-basing");
check("flour recorded inflation uses the wrong pre-October cost: 10 → 22 = +120%", it("flour").recordedPct === 120, String(it("flour").recordedPct));
check("flour re-based on first purchase since baseline: 20 → 22 = +10%", it("flour").rebasedPct === 10, String(it("flour").rebasedPct));
check("flour basis is the 5 Oct purchase", it("flour").basisDate === "2026-10-05" && it("flour").basisPrice === 20);
check("flour shows the excluded pre-baseline row", it("flour").rowsBefore === 1 && it("flour").lastPriceBefore === 10);
check("flour status re-based", it("flour").status === "REBASED");

console.log("no reliable basis");
check("butter (bought only before baseline) needs corrected data", it("butter").status === "NO_RELIABLE_BASIS" && it("butter").rebasedPct === null);
check("butter keeps its last unreliable price for the requirement list", it("butter").lastPriceBefore === 55);
check("salt with one purchase since baseline: no inflation measurable yet", it("salt").status === "SINGLE_PURCHASE" && it("salt").rebasedPct === null);
check("salt recorded inflation 4 → 5 still shown for comparison", it("salt").recordedPct === 25);

console.log("unaffected items");
check("sugar (no pre-baseline history) unchanged: +10% both ways", it("sugar").status === "UNCHANGED" && it("sugar").recordedPct === 10 && it("sugar").rebasedPct === 10);

console.log("impact summary");
check("3 pre-baseline rows excluded", r.summary.rowsExcluded === 3, String(r.summary.rowsExcluded));
check("1 item needs corrected data", r.summary.itemsNeedingData === 1);
check("items changed: flour, butter, salt", r.summary.itemsChanged === 3, String(r.summary.itemsChanged));
check("average re-based uses measurable items only", r.summary.averageRebasedPct === 10, String(r.summary.averageRebasedPct));
check("rows are not mutated", rows[0].new_price === 10 && rows.length === 8);

console.log("dates");
check("isIsoDay accepts 2026-10-01, rejects 2026-13-01 and text", m.isIsoDay("2026-10-01") && !m.isIsoDay("2026-13-01") && !m.isIsoDay("Oct"));
check("row without invoice date falls back to created_at", m.rowDate({ invoice_date: null, created_at: "2026-10-03T08:00:00Z" }) === "2026-10-03");
check("agreed baseline is October 2026", m.AGREED_INFLATION_BASELINE === "2026-10-01");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
