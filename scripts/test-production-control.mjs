#!/usr/bin/env node
/**
 * Daily Production Control Report engine.   npm run test:production-control
 * Expected values are written out by hand from the fixture.
 * Family A: no network, no database, no credentials, no writes.
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const { buildProductionControlReport } = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-production-control.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`);
};

const TODAY = "2026-11-25";
const run = (id, extra) => ({
  id, run_number: `PR-${id}`, product_id: "pie", product_name_snapshot: "Beef Pie", bom_id: "b1", bom_name_snapshot: "Beef Pie",
  status: "Planned", planned_qty: 100, actual_qty: 100, planned_cost: 500, total_production_cost: 0,
  created_at: "2026-11-25T06:00:00Z", started_at: null, completed_at: null, created_by: "Sipho", started_by: null, completed_by: null, notes: null,
  planned_date: null, original_planned_date: null, due_date: null, priority: null, production_area: null, responsible_person: null,
  on_hold: false, on_hold_reason: null, rejected_qty: null, rework_qty: null, downtime_minutes: null, downtime_reason: null,
  ...extra,
});
const runs = [
  run("done", { status: "Completed", planned_qty: 100, actual_qty: 95, total_production_cost: 480, planned_date: "2026-11-25", completed_at: "2026-11-25T14:00:00Z", due_date: "2026-11-26", rejected_qty: 3, rework_qty: 2 }),
  run("inprod", { status: "In Production", planned_qty: 50, actual_qty: 50, planned_date: "2026-11-25", priority: "Urgent", due_date: "2026-11-24", started_at: "2026-11-25T08:00:00Z" }),
  run("open1", { status: "Approved", planned_qty: 40, planned_date: "2026-11-25" }),
  run("old", { status: "Planned", planned_qty: 30, planned_date: "2026-11-20", original_planned_date: "2026-11-18" }),
  run("cancel", { status: "Cancelled", planned_qty: 70, planned_date: "2026-11-25" }),
  run("nodate", { status: "Completed", planned_qty: 10, actual_qty: 10, created_at: "2026-11-25T05:00:00Z", completed_at: "2026-11-25T09:00:00Z", total_production_cost: 50 }),
  run("future", { status: "Planned", planned_qty: 99, planned_date: "2026-12-01" }),
];
const line = (runId, qty, extra = {}) => ({
  production_run_id: runId, line_type: "Ingredient", ingredient_id: "flour", stock_item_id: "s-flour", line_name: "Flour", unit: "kg", planned_qty: qty, unit_cost: 2, ...extra,
});
const runLines = [
  line("old", 10), // earliest schedule: allocated first
  line("inprod", 10),
  line("open1", 10),
  line("open1", 1, { ingredient_id: "salt", stock_item_id: null, line_name: "Salt", unit_cost: 0 }),
];
const input = {
  from: TODAY, to: TODAY, today: TODAY, view: "daily",
  runs, runLines,
  stockItems: [{ id: "s-flour", entity_type: "ingredient", entity_id: "flour", description: "Flour", unit: "kg", qty_on_hand: 25 }],
  openPoLines: [{ ingredient_id: "flour", item_id: null, outstanding_qty: 50, po_number: "PO-0007", status: "Sent", expected_date: "2026-11-27" }],
  products: [{ id: "pie", product_name: "Beef Pie", sku: "BP-1", selling_price: 12 }],
  wastage: [{ production_run_id: "done", waste_qty: 1.5, waste_value: 9 }],
  bomRows: [],
  controlFieldsAvailable: true,
};
const r = buildProductionControlReport(input);
const job = (id) => r.jobs.find((j) => j.id === id);

console.log("Schedule");
check("future-dated run not in today's schedule", !job("future"));
check("open run from before the period is carried forward", job("old")?.carriedForward === true);
check("carried-forward job keeps original planned date", job("old")?.originalPlannedDate === "2026-11-18");
check("run without a planned date is scheduled on its creation date, labelled", job("nodate")?.scheduleSource === "created" && job("nodate")?.scheduleDate === TODAY);
check("cancelled run listed with status Cancelled", job("cancel")?.status === "Cancelled");

console.log("Planned vs actual (issued plan is the baseline)");
check("completed: actual 95 vs planned 100, variance -5", job("done").actualQty === 95 && job("done").variance === -5);
check("completed: achievement 95.0%", job("done").achievementPct === 95);
check("in production: actual NOT taken from plan (0, not recorded)", job("inprod").actualQty === 0 && job("inprod").actualRecorded === false);
check("in production: outstanding 50", job("inprod").outstandingQty === 50);
check("planned units exclude cancelled + carried forward: 100+50+40+10 = 200", r.kpis.plannedUnits === 200, r.kpis.plannedUnits);
check("actual units: 95 + 10 = 105", r.kpis.actualUnits === 105, r.kpis.actualUnits);
check("achievement 52.5%", r.kpis.achievementPct === 52.5, r.kpis.achievementPct);
const prod = r.products.find((p) => p.product === "Beef Pie");
check("product summary: planned 200, actual 105, carry-forward 30", prod.plannedQty === 200 && prod.actualQty === 105 && prod.carryForwardQty === 30, JSON.stringify(prod));

console.log("Material readiness — no double allocation");
const mOld = job("old").materials[0];
const mIn = job("inprod").materials[0];
const mOpen = job("open1").materials.find((m) => m.name === "Flour");
check("earliest job (old) gets first 10 of 25: Ready", mOld.status === "Ready" && mOld.allocatedToEarlierJobs === 0);
check("second job sees 10 allocated earlier: Ready", mIn.status === "Ready" && mIn.allocatedToEarlierJobs === 10);
check("third job: 20 already allocated, short 5", mOpen.status === "Short" && mOpen.shortage === 5 && mOpen.allocatedToEarlierJobs === 20, JSON.stringify(mOpen));
check("on-order quantity and PO shown", mOpen.onOrder === 50 && mOpen.onOrderRefs[0].includes("PO-0007"));
check("ingredient with no stock record: 'Not stocked', not ready", job("open1").materials.find((m) => m.name === "Salt").status === "Not stocked");
check("jobs with shortages: 1", r.kpis.materialShortageJobs === 1, r.kpis.materialShortageJobs);
check("completed job materials shown as consumed", job("done").materialStatus === "Consumed");

console.log("Exceptions and KPIs");
check("overdue: in-production run past its required date", job("inprod").overdue === true && r.kpis.jobsOverdue === 1);
check("urgent flagged", job("inprod").urgent === true);
check("insufficient stock exception with PO action", r.exceptions.some((e) => e.type === "Insufficient stock" && e.jobNumber === "PR-open1" && /Expedite/.test(e.action)));
check("missing ingredient stock exception", r.exceptions.some((e) => e.type === "Missing ingredients" && e.reason.includes("Salt")));
check("missing cost exception (salt has no unit cost)", r.exceptions.some((e) => e.type === "Missing cost" && e.jobNumber === "PR-open1"));
check("delayed / not started exception for carried-forward run", r.exceptions.some((e) => e.jobNumber === "PR-old" && e.type === "Production delayed"));
check("quality exception for rejects/rework", r.exceptions.some((e) => e.type === "Quality / rework" && e.jobNumber === "PR-done"));
check("first-pass yield = (95-3-2)/95 = 94.7%", r.kpis.firstPassYieldPct === 94.7, r.kpis.firstPassYieldPct);
check("on-time completion 100% (done by due date)", r.kpis.onTimeCompletionPct === 100, r.kpis.onTimeCompletionPct);
check("schedule adherence 100% (completed on planned date)", r.kpis.scheduleAdherencePct === 100, r.kpis.scheduleAdherencePct);
check("downtime not captured -> null + listed unavailable", r.kpis.downtimeMinutes === null && r.unavailable.some((u) => u.metric === "Downtime"));
check("OEE never calculated", r.unavailable.some((u) => u.metric === "OEE"));
check("production cost of completed = 480 + 50", r.kpis.productionCost === 530, r.kpis.productionCost);
check("output value = 105 x 12 = 1260", r.kpis.outputValue === 1260, r.kpis.outputValue);
check("outstanding value = (50+40+30) x 12 = 1440", r.kpis.outstandingValue === 1440, r.kpis.outstandingValue);
check("waste recorded on job", job("done").wasteQty === 1.5);
check("note: run without planned date disclosed", r.dataNotes.some((n) => /no planned production date/.test(n)));

console.log("Disclosure when every actual equals plan");
const allEqual = buildProductionControlReport({
  ...input,
  runs: [run("a", { status: "Completed", planned_qty: 10, actual_qty: 10, planned_date: TODAY, completed_at: "2026-11-25T10:00:00Z" })],
  runLines: [],
});
check("pre-filled actuals disclosed", allEqual.dataNotes.some((n) => /pre-fills the actual quantity/.test(n)));

console.log("Weekly / monthly summaries");
const weekly = buildProductionControlReport({ ...input, from: "2026-11-17", to: "2026-11-30", view: "weekly" });
check("two ISO weekly buckets (Mon 16 Nov, Mon 23 Nov)", weekly.buckets.map((b) => b.from).join(",") === "2026-11-16,2026-11-23", weekly.buckets.map((b) => b.from).join(","));
check("week of 23 Nov: planned excludes cancelled (100+50+40+10=200)", weekly.buckets[1].plannedQty === 200, weekly.buckets[1].plannedQty);
const monthly = buildProductionControlReport({ ...input, from: "2026-11-01", to: "2026-12-31", view: "monthly" });
check("monthly buckets Nov + Dec", monthly.buckets.map((b) => b.label).join(",") === "2026-11,2026-12");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
