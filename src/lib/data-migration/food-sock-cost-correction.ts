/**
 * VYRON — Food Sock cost-precision correction (Family P).
 *
 * Corrects exactly what the Food Sock import could not store:
 *
 *   Date Sticker   ingredient purchase_cost / true_unit_cost   0.05 → 0.05064
 *   Insert Sleeve  ingredient purchase_cost / true_unit_cost   0.32 → 0.3164
 *   Date Sticker   stock item average_cost 0.0506 → 0.05064,
 *                  inventory_value 2844.48 → 2846.73 (its opening ledger value)
 *
 * The Insert Sleeve stock item is verified consistent (24058.75 × 0.3164 =
 * 7612.19) and is not changed.
 *
 * This module plans (SELECT only) and calls the database function
 * apply_food_sock_cost_precision_correction(), which re-verifies everything
 * under row locks and applies the correction in one transaction or not at all.
 * The scope is fixed here and in the function; nothing about it is an input.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { stableHash } from "@/lib/data-migration/core";
import type { FoodSockSources } from "@/lib/data-migration/food-sock-sources";

export const CORRECTION_KEY = "food-sock-cost-precision-2026-09";
export const CORRECTION_VERSION = "food-sock-cost-precision-v1";
export const FOOD_SOCK_COMPANY_ID = "e920c747-1d27-4d01-9e7c-182f9a7d0aa3";
export const FOOD_SOCK_PRODUCTION_DB_REF = "pnbstrqsrfoubdgcgimi";
export const CORRECTION_RPC = "apply_food_sock_cost_precision_correction";
/**
 * The plan hash a named person approved; --execute refuses any other.
 * Approved by Gerhard on 2026-09-16 (Phase 44): the READY dry run against
 * production after migrations 20260917090000 and 20260917100000 were applied.
 */
export const APPROVED_PLAN_HASH: string | null = "e1e6a2a28cb94de7528f643eb896e04d4fa5ca614dd984cb76e3bc8ccb0c23f4";

type IngredientTarget = { id: string; name: string; sourceKey: string; from: number; to: number };
export const INGREDIENT_TARGETS: readonly IngredientTarget[] = [
  { id: "03097405-22d1-42a5-bbcf-7162910848d4", name: "Date Sticker", sourceKey: "product:name:date sticker", from: 0.05, to: 0.05064 },
  { id: "8a83683d-0475-42db-bb1c-2758b08ec2c2", name: "Insert Sleeve", sourceKey: "product:name:insert sleeve", from: 0.32, to: 0.3164 },
];
export const STOCK_TARGET = {
  ingredientId: "03097405-22d1-42a5-bbcf-7162910848d4",
  quantity: 56215,
  currentCost: 0.05064,
  averageFrom: 0.0506,
  averageTo: 0.05064,
  valueFrom: 2844.48,
  valueTo: 2846.73,
} as const;
export const STOCK_UNCHANGED = {
  ingredientId: "8a83683d-0475-42db-bb1c-2758b08ec2c2",
  quantity: 24058.75,
  cost: 0.3164,
  value: 7612.19,
} as const;

export const correctionAcknowledgement = (planHash: string) =>
  `CORRECT FOOD SOCK COST PRECISION ${planHash.slice(0, 12)} IN ${FOOD_SOCK_COMPANY_ID}`;

type Row = Record<string, unknown>;
export type CorrectionState = {
  companyId: string;
  ingredients: Row[];
  sameNamedIngredients: Row[];
  sourceLinks: Row[];
  stockItems: Row[];
  ledger: Row[];
  correctionTable: "present" | "missing";
  existingCorrection: Row | null;
};

export type SourceEvidence = {
  file: string;
  sha256: string;
  costs: { name: string; row: number | null; raw: string | null }[];
};

export type CorrectionPlan = {
  version: string;
  correctionKey: string;
  companyId: string;
  status: "ready" | "already_applied" | "blocked";
  blockers: string[];
  stockItemId: string | null;
  unchangedStockItemId: string | null;
  source: SourceEvidence;
  changes: { table: string; id: string; field: string; from: unknown; to: unknown }[];
  verifiedUnchanged: { table: string; id: string; fields: Row }[];
  planHash: string;
};

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** Reads everything the plan depends on. SELECT only; every query names the company or the fixed ids. */
export async function readCorrectionState(supabase: SupabaseClient, companyId: string): Promise<CorrectionState> {
  const ids = INGREDIENT_TARGETS.map((t) => t.id);
  const must = <T>(label: string, res: { data: T | null; error: { message: string } | null }) => {
    if (res.error) throw new Error(`${label}: ${res.error.message}`);
    return (res.data || []) as T;
  };
  const ingredients = must<Row[]>("ingredients", await supabase.from("vyron_cost_ingredients").select("id, company_id, ingredient_name, purchase_cost, true_unit_cost").in("id", ids));
  const sameNamed = must<Row[]>("same-named ingredients", await supabase.from("vyron_cost_ingredients").select("id, company_id, ingredient_name").eq("company_id", companyId).in("ingredient_name", INGREDIENT_TARGETS.map((t) => t.name)));
  const sourceLinks = must<Row[]>(
    "source links",
    await supabase.from("vyron_import_source_links").select("source_system, source_entity, source_key, entity_id, company_id").eq("company_id", companyId).eq("source_system", "inflow").eq("source_entity", "product").in("source_key", INGREDIENT_TARGETS.map((t) => t.sourceKey))
  );
  const stockItems = must<Row[]>("stock items", await supabase.from("vyron_cost_stock_items").select("id, company_id, entity_id, qty_on_hand, current_cost, average_cost, inventory_value").in("entity_id", ids));
  const stockIds = stockItems.map((s) => String(s.id));
  const ledger = stockIds.length
    ? must<Row[]>("ledger", await supabase.from("vyron_cost_stock_ledger").select("id, company_id, stock_item_id, movement_type, quantity_in, quantity_out, balance_after, unit_cost, value").in("stock_item_id", stockIds))
    : [];
  const corrections = await supabase.from("vyron_data_corrections").select("id, correction_key, company_id, plan_hash, approver, applied_at").eq("correction_key", CORRECTION_KEY);
  const correctionTable = corrections.error ? "missing" : "present";
  if (corrections.error && !/schema cache|does not exist/i.test(corrections.error.message)) throw new Error(`corrections: ${corrections.error.message}`);
  return {
    companyId,
    ingredients,
    sameNamedIngredients: sameNamed,
    sourceLinks,
    stockItems,
    ledger,
    correctionTable,
    existingCorrection: ((corrections.data || []) as Row[])[0] ?? null,
  };
}

/** The client's own cost for each target, from the product export the import used. */
export function sourceEvidence(sources: FoodSockSources): SourceEvidence {
  const file = sources.files.find((f) => f.key === "products");
  return {
    file: file?.name ?? "(missing)",
    sha256: file?.sha256 ?? "",
    costs: INGREDIENT_TARGETS.map((target) => {
      const matches = sources.products.filter((p) => p.name.trim() === target.name);
      const cost = matches.length === 1 && matches[0].cost.kind === "number" ? matches[0].cost.raw : null;
      return { name: target.name, row: matches.length === 1 ? matches[0].ref.row : null, raw: cost };
    }),
  };
}

/** Builds the correction plan and every reason it cannot run. Pure. */
export function buildCorrectionPlan(state: CorrectionState, source: SourceEvidence): CorrectionPlan {
  const blockers: string[] = [];
  const block = (message: string) => blockers.push(message);
  const changes: CorrectionPlan["changes"] = [];
  const verifiedUnchanged: CorrectionPlan["verifiedUnchanged"] = [];
  let applied = 0;

  if (state.companyId !== FOOD_SOCK_COMPANY_ID) block(`The correction is bound to company ${FOOD_SOCK_COMPANY_ID}, not ${state.companyId}.`);
  if (state.correctionTable === "missing") block("vyron_data_corrections does not exist: apply migrations 20260917090000 and 20260917100000 first.");

  for (const target of INGREDIENT_TARGETS) {
    const cost = source.costs.find((c) => c.name === target.name);
    if (!cost?.raw || Number(cost.raw) !== target.to) block(`The source file does not give ${target.name} a cost of ${target.to} (found ${cost?.raw ?? "nothing"}).`);
    const row = state.ingredients.find((r) => r.id === target.id);
    if (!row) {
      block(`Ingredient ${target.id} (${target.name}) does not exist.`);
      continue;
    }
    if (row.company_id !== FOOD_SOCK_COMPANY_ID) block(`Ingredient ${target.id} belongs to ${row.company_id}, not the Food Sock tenant.`);
    if (row.ingredient_name !== target.name) block(`Ingredient ${target.id} is "${row.ingredient_name}", not "${target.name}".`);
    if (!state.sourceLinks.some((l) => l.source_key === target.sourceKey && l.entity_id === target.id)) block(`Ingredient ${target.id} is not the row the import linked to ${target.sourceKey}.`);
    const purchase = num(row.purchase_cost);
    const trueCost = num(row.true_unit_cost);
    if (purchase === target.to && trueCost === target.to) applied += 1;
    else if (purchase !== target.from || trueCost !== target.from) block(`${target.name} costs are ${purchase} / ${trueCost}, not the expected ${target.from} / ${target.from}.`);
    changes.push({ table: "vyron_cost_ingredients", id: target.id, field: "purchase_cost", from: target.from, to: target.to });
    changes.push({ table: "vyron_cost_ingredients", id: target.id, field: "true_unit_cost", from: target.from, to: target.to });
  }
  const namedCount = state.sameNamedIngredients.length;
  if (namedCount !== INGREDIENT_TARGETS.length) block(`The tenant holds ${namedCount} ingredients named ${INGREDIENT_TARGETS.map((t) => t.name).join(" or ")}; exactly ${INGREDIENT_TARGETS.length} are required.`);

  const stockFor = (ingredientId: string) => state.stockItems.filter((s) => s.entity_id === ingredientId);
  const ledgerFor = (stockItemId: string) => state.ledger.filter((l) => l.stock_item_id === stockItemId);

  let stockItemId: string | null = null;
  const stickerStock = stockFor(STOCK_TARGET.ingredientId);
  if (stickerStock.length !== 1) block(`Expected exactly one Date Sticker stock item, found ${stickerStock.length}.`);
  else {
    const stock = stickerStock[0];
    stockItemId = String(stock.id);
    if (stock.company_id !== FOOD_SOCK_COMPANY_ID) block(`The Date Sticker stock item ${stock.id} is not in the Food Sock tenant.`);
    const ledger = ledgerFor(stockItemId);
    const opening = ledger[0];
    if (
      ledger.length !== 1 ||
      opening.movement_type !== "Opening Balance" ||
      opening.company_id !== FOOD_SOCK_COMPANY_ID ||
      num(opening.quantity_in) !== STOCK_TARGET.quantity ||
      Number(opening.quantity_out || 0) !== 0 ||
      num(opening.balance_after) !== STOCK_TARGET.quantity ||
      num(opening.unit_cost) !== STOCK_TARGET.averageTo ||
      num(opening.value) !== STOCK_TARGET.valueTo
    ) {
      block(`The Date Sticker ledger is not the single opening balance of ${STOCK_TARGET.quantity} at ${STOCK_TARGET.averageTo} (${STOCK_TARGET.valueTo}); found ${ledger.length} row(s).`);
    }
    const [qty, current, average, value] = [num(stock.qty_on_hand), num(stock.current_cost), num(stock.average_cost), num(stock.inventory_value)];
    if (qty !== STOCK_TARGET.quantity || current !== STOCK_TARGET.currentCost) block(`The Date Sticker stock item holds ${qty} at current cost ${current}, not ${STOCK_TARGET.quantity} at ${STOCK_TARGET.currentCost}.`);
    if (average === STOCK_TARGET.averageTo && value === STOCK_TARGET.valueTo) applied += 1;
    else if (average !== STOCK_TARGET.averageFrom || value !== STOCK_TARGET.valueFrom) block(`The Date Sticker stock item is valued ${average} / ${value}, not the expected ${STOCK_TARGET.averageFrom} / ${STOCK_TARGET.valueFrom}.`);
    if (Math.round(STOCK_TARGET.quantity * STOCK_TARGET.averageTo * 100) / 100 !== STOCK_TARGET.valueTo) block("The corrected value does not equal quantity × corrected cost.");
    changes.push({ table: "vyron_cost_stock_items", id: stockItemId, field: "average_cost", from: STOCK_TARGET.averageFrom, to: STOCK_TARGET.averageTo });
    changes.push({ table: "vyron_cost_stock_items", id: stockItemId, field: "inventory_value", from: STOCK_TARGET.valueFrom, to: STOCK_TARGET.valueTo });
  }

  let unchangedStockItemId: string | null = null;
  const sleeveStock = stockFor(STOCK_UNCHANGED.ingredientId);
  if (sleeveStock.length !== 1) block(`Expected exactly one Insert Sleeve stock item, found ${sleeveStock.length}.`);
  else {
    const stock = sleeveStock[0];
    unchangedStockItemId = String(stock.id);
    const ledger = ledgerFor(unchangedStockItemId);
    const consistent =
      stock.company_id === FOOD_SOCK_COMPANY_ID &&
      num(stock.qty_on_hand) === STOCK_UNCHANGED.quantity &&
      num(stock.current_cost) === STOCK_UNCHANGED.cost &&
      num(stock.average_cost) === STOCK_UNCHANGED.cost &&
      num(stock.inventory_value) === STOCK_UNCHANGED.value &&
      ledger.length === 1 &&
      ledger[0].movement_type === "Opening Balance" &&
      num(ledger[0].quantity_in) === STOCK_UNCHANGED.quantity &&
      num(ledger[0].unit_cost) === STOCK_UNCHANGED.cost &&
      num(ledger[0].value) === STOCK_UNCHANGED.value;
    if (!consistent) block(`The Insert Sleeve valuation is not the consistent ${STOCK_UNCHANGED.quantity} × ${STOCK_UNCHANGED.cost} = ${STOCK_UNCHANGED.value}; correcting it is outside the approved scope.`);
    verifiedUnchanged.push({ table: "vyron_cost_stock_items", id: unchangedStockItemId, fields: { qty_on_hand: STOCK_UNCHANGED.quantity, average_cost: STOCK_UNCHANGED.cost, inventory_value: STOCK_UNCHANGED.value } });
  }

  const alreadyApplied = applied === INGREDIENT_TARGETS.length + 1;
  if (state.existingCorrection && !alreadyApplied) block(`Correction ${CORRECTION_KEY} is recorded as applied, but the values differ from the corrected ones.`);
  if (!state.existingCorrection && applied > 0) block("Some targets already hold corrected values but no correction is recorded; review before any change.");
  const status: CorrectionPlan["status"] = blockers.length ? "blocked" : alreadyApplied ? "already_applied" : "ready";

  const body = {
    version: CORRECTION_VERSION,
    correctionKey: CORRECTION_KEY,
    companyId: state.companyId,
    source,
    stockItemId,
    unchangedStockItemId,
    changes,
    verifiedUnchanged,
    ledger: state.ledger.map((l) => ({ id: l.id, stock_item_id: l.stock_item_id, quantity_in: num(l.quantity_in), unit_cost: num(l.unit_cost), value: num(l.value) })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    status,
    blockers,
  };
  return { version: CORRECTION_VERSION, correctionKey: CORRECTION_KEY, companyId: state.companyId, status, blockers, stockItemId, unchangedStockItemId, source, changes, verifiedUnchanged, planHash: stableHash(body) };
}

export class CorrectionRefused extends Error {}

export type CorrectionApproval = {
  approvedPlanHash: string | null | undefined;
  pinnedPlanHash: string | null;
  approver: string | null | undefined;
  acknowledgement: string | null | undefined;
  reason: string | null | undefined;
  productionWriteAcknowledged: boolean;
};

/** Every execution gate that does not need the database. Throws CorrectionRefused. */
export function checkCorrectionGates(plan: CorrectionPlan, approval: CorrectionApproval) {
  if (plan.companyId !== FOOD_SOCK_COMPANY_ID) throw new CorrectionRefused(`The correction is bound to company ${FOOD_SOCK_COMPANY_ID}.`);
  if (!approval.pinnedPlanHash) throw new CorrectionRefused("No plan hash has been approved and pinned in food-sock-cost-correction.ts; nothing may be applied.");
  if (approval.approvedPlanHash !== approval.pinnedPlanHash) throw new CorrectionRefused(`--approve-plan-hash must be the pinned approved hash ${approval.pinnedPlanHash}.`);
  if (plan.planHash !== approval.pinnedPlanHash) throw new CorrectionRefused(`The plan rebuilt from the tenant's current state hashes to ${plan.planHash}, not the approved ${approval.pinnedPlanHash}.`);
  if (plan.status === "blocked") throw new CorrectionRefused(`The plan is blocked:\n  - ${plan.blockers.join("\n  - ")}`);
  if (!approval.approver?.trim()) throw new CorrectionRefused("A named approver is required.");
  if (!approval.reason?.trim()) throw new CorrectionRefused("A reason is required.");
  const expected = correctionAcknowledgement(plan.planHash);
  if (approval.acknowledgement !== expected) throw new CorrectionRefused(`The acknowledgement must be exactly "${expected}".`);
  if (!approval.productionWriteAcknowledged) throw new CorrectionRefused("VYRON_ACKNOWLEDGE_PRODUCTION_WRITE=1 is required.");
  if (!plan.stockItemId) throw new CorrectionRefused("The Date Sticker stock item was not resolved.");
}

/** Gates, then the single-transaction database function. Returns what the function returned. */
export async function applyCorrection(supabase: SupabaseClient, plan: CorrectionPlan, approval: CorrectionApproval) {
  checkCorrectionGates(plan, approval);
  const { data, error } = await supabase.rpc(CORRECTION_RPC, {
    p_company_id: plan.companyId,
    p_stock_item_id: plan.stockItemId,
    p_plan_hash: plan.planHash,
    p_approver: String(approval.approver).trim(),
    p_acknowledgement: approval.acknowledgement,
    p_reason: String(approval.reason).trim(),
  });
  if (error) throw new CorrectionRefused(`The database refused the correction; nothing was changed: ${error.message}`);
  return data as { status: "applied" | "already_applied"; correction_id: string; plan_hash: string } & Row;
}
