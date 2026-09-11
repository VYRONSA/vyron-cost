/**
 * Food Sock Meals — Phase 1 executor.
 *
 * Applies an APPROVED plan (built by food-sock-plan.ts against this tenant's
 * current state) to one existing tenant, through VYRON's own writers:
 *
 *   suppliers        vyron_cost_suppliers + the contact master (upsertVyronContact)
 *   categories       vyron_cost_categories
 *   stock items      vyron_cost_ingredients + findOrCreateStockItem (ING-… codes, entity-linked)
 *   finished goods   vyron_cost_products + findOrCreateStockItem (FG-… codes, entity-linked)
 *   BOMs             createRecipe (costs, packaging split, product link)
 *   opening stock    postOpeningStockMovement (refuses a second opening balance)
 *
 * Guarantees:
 *  - Refuses to start unless the plan hash is the one a person approved and the
 *    plan was built against this exact tenant.
 *  - Every write carries the tenant's company_id; nothing is deleted, and no row
 *    this run did not create is updated (except the product↔BOM link that
 *    createRecipe itself maintains for a product this run owns).
 *  - Idempotent and restartable: each record is looked up by its source link
 *    first, then by exact identity inside the tenant; a re-run creates nothing.
 *  - A record whose dependency is missing (its supplier, component, product or
 *    stock item) fails with a reason — it is never written with the link blank.
 *  - Values VYRON's writers would otherwise default are passed explicitly: no
 *    invented payment terms, reorder levels, target margins or previous costs.
 *  - After writing, every record is read back and compared with the plan.
 */
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeName, normalizeSku, stableHash, type PlanItem } from "@/lib/data-migration/core";
import type { FoodSockPlan, StageName } from "@/lib/data-migration/food-sock-plan";
import { upsertVyronContact } from "@/lib/vyron-contact-master";
import { createRecipe } from "@/lib/vyron-cost-recipes-data";
import { findOrCreateStockItem, hasOpeningBalance, postOpeningStockMovement } from "@/lib/vyron-inventory";

export const IMPORT_SOURCE_SYSTEM = "inflow";
export const IMPORT_ACTOR = "food-sock-import";
/**
 * Imported BOMs arrive as Draft. The app's BOM statuses are Draft and
 * Approved, and nobody has approved these recipes in VYRON — marking them
 * Approved would invent that. Production runs do not depend on the status.
 */
export const IMPORTED_BOM_STATUS = "Draft";

export type ExecutionScope = "demo" | "all_planned";
export type RecordStatus = "created" | "linked_existing" | "already_imported" | "failed";
export type RecordResult = {
  stage: StageName;
  sourceKey: string;
  status: RecordStatus;
  entityType: string;
  entityId: string | null;
  detail: string | null;
};
export type ReconciliationFinding = { stage: StageName; sourceKey: string; field: string; expected: unknown; actual: unknown };
export type ExecutionReport = {
  companyId: string;
  planHash: string;
  scope: ExecutionScope;
  runId: string | null;
  startedAt: string;
  finishedAt: string;
  results: RecordResult[];
  counts: Record<string, Record<RecordStatus, number>>;
  reconciliation: ReconciliationFinding[];
};

export class ExecutionRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionRefused";
  }
}

type WritableStage = "B_categories" | "C_suppliers" | "E_stock_items" | "F_finished_goods" | "I_boms" | "K_opening_stock";
const WRITE_ORDER: WritableStage[] = ["C_suppliers", "B_categories", "E_stock_items", "F_finished_goods", "I_boms", "K_opening_stock"];

type Proposed = Record<string, unknown>;
const proposedOf = (item: PlanItem) => (item.proposed || {}) as Proposed;
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

/* ---------------------------------------------------------------- scope */

/**
 * The records a run writes. "demo" is the demo-ready finished goods plus only
 * what they need — their BOMs, those BOMs' components, the components'
 * suppliers, categories and opening stock. "all_planned" is every create/match
 * record in the plan. Exceptions and skips are never written.
 */
export function selectExecutionItems(plan: FoodSockPlan, scope: ExecutionScope): Record<WritableStage, PlanItem[]> {
  const writable = (stage: WritableStage) => plan.stages[stage].items.filter((item) => item.action === "create" || item.action === "match");
  if (scope === "all_planned") {
    return Object.fromEntries(WRITE_ORDER.map((stage) => [stage, writable(stage)])) as Record<WritableStage, PlanItem[]>;
  }
  const demoProducts = new Set(plan.demoReadiness.filter((d) => d.ready).map((d) => `product:${d.productKey}`));
  const finished = writable("F_finished_goods").filter((item) => demoProducts.has(item.sourceKey));
  const boms = writable("I_boms").filter((item) => demoProducts.has(String(proposedOf(item).finished_product_key)));
  const componentKeys = new Set(boms.flatMap((item) => ((proposedOf(item).lines as Proposed[]) || []).map((line) => String(line.component_key))));
  const stock = writable("E_stock_items").filter((item) => componentKeys.has(item.sourceKey));
  const supplierKeys = new Set(stock.map((item) => text(proposedOf(item).supplier_key)).filter(Boolean) as string[]);
  const categoryKeys = new Set([
    ...stock.map((item) => `category:Ingredient:${normalizeName(proposedOf(item).category)}`),
    ...finished.map((item) => `category:Product:${normalizeName(proposedOf(item).category)}`),
  ]);
  return {
    C_suppliers: writable("C_suppliers").filter((item) => supplierKeys.has(item.sourceKey)),
    B_categories: writable("B_categories").filter((item) => categoryKeys.has(item.sourceKey)),
    E_stock_items: stock,
    F_finished_goods: finished,
    I_boms: boms,
    K_opening_stock: writable("K_opening_stock").filter((item) => componentKeys.has(String(proposedOf(item).product_key))),
  };
}

/* ------------------------------------------------------------ execution */

type Context = {
  supabase: SupabaseClient;
  companyId: string;
  plan: FoodSockPlan;
  runId: string | null;
  results: RecordResult[];
};

export const EXECUTION_SCOPES: readonly ExecutionScope[] = ["demo", "all_planned"];

/**
 * The words an operator types to authorise one execution. Bound to the plan,
 * the scope AND the tenant, so an acknowledgement typed for one plan, scope or
 * tenant cannot authorise another (the same rule as scripts/safety/acknowledge.mjs).
 * The full plan hash is required separately and must match exactly.
 */
export function executionAcknowledgement(planHash: string, companyId: string, scope: ExecutionScope) {
  return `IMPORT FOOD SOCK PLAN ${planHash.slice(0, 12)} SCOPE ${scope} INTO ${companyId}`;
}

export type ExecutionApproval = {
  /** The named person who approved this plan hash, for this scope and tenant. */
  approver: string;
  /** Must equal executionAcknowledgement(planHash, companyId, scope). */
  acknowledgement: string;
};

export type ExecutionOptions = {
  companyId: string;
  approvedPlanHash: string;
  scope: ExecutionScope;
  approval: ExecutionApproval;
};

/** Every check that needs no database. Runs before the first query of any kind. */
export function checkExecutionGates(plan: FoodSockPlan, options: ExecutionOptions) {
  if (options.scope === undefined || options.scope === null || String(options.scope) === "") throw new ExecutionRefused("No execution scope. The approval is bound to one: demo or all_planned.");
  if (!EXECUTION_SCOPES.includes(options.scope)) throw new ExecutionRefused(`Unknown scope "${options.scope}". Allowed: ${EXECUTION_SCOPES.join(", ")}.`);
  if (!options.approvedPlanHash || options.approvedPlanHash !== plan.planHash) {
    throw new ExecutionRefused(`Plan hash ${plan.planHash} is not the approved plan ${options.approvedPlanHash || "(none)"}. Re-run the dry run and approve the plan it produces.`);
  }
  if (plan.target.mode !== "existing_tenant" || plan.target.companyId !== options.companyId) {
    throw new ExecutionRefused("The plan was not built against this tenant. Build it with --company so matches reflect what the tenant already holds.");
  }
  if (!options.approval?.approver?.trim()) throw new ExecutionRefused("No named approver. An execution needs the person who approved this plan hash.");
  const expected = executionAcknowledgement(plan.planHash, options.companyId, options.scope);
  if (options.approval.acknowledgement !== expected) {
    throw new ExecutionRefused(`Acknowledgement missing or wrong. Expected exactly: "${expected}".`);
  }
}

async function preflight(supabase: SupabaseClient, companyId: string) {
  const company = await supabase.from("vyron_cost_companies").select("id").eq("id", companyId).maybeSingle();
  if (company.error) throw new ExecutionRefused(`Could not read the company: ${company.error.message}`);
  if (!company.data) throw new ExecutionRefused(`Company ${companyId} does not exist.`);
  const workspaces = await supabase.from("vyron_workspaces").select("id").eq("company_id", companyId);
  if (workspaces.error) throw new ExecutionRefused(`Could not read workspaces: ${workspaces.error.message}`);
  if (!(workspaces.data || []).length) throw new ExecutionRefused(`Company ${companyId} has no workspace; create the tenant through the admin flow first.`);
  const links = await supabase.from("vyron_import_source_links").select("id").eq("company_id", companyId).limit(1);
  if (links.error) {
    throw new ExecutionRefused(`vyron_import_source_links is not available (${links.error.message}). Apply migration 20260910170000 first.`);
  }
}

async function findLink(ctx: Context, entity: string, key: string): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from("vyron_import_source_links")
    .select("entity_id")
    .eq("company_id", ctx.companyId)
    .eq("source_system", IMPORT_SOURCE_SYSTEM)
    .eq("source_entity", entity)
    .eq("source_key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.entity_id ? String(data.entity_id) : null;
}

async function writeLink(ctx: Context, entity: string, item: PlanItem, entityType: string, entityId: string) {
  const ref = item.sources[0];
  const { error } = await ctx.supabase.from("vyron_import_source_links").insert({
    company_id: ctx.companyId,
    source_system: IMPORT_SOURCE_SYSTEM,
    source_entity: entity,
    source_key: item.sourceKey,
    entity_type: entityType,
    entity_id: entityId,
    import_run_id: ctx.runId,
    source_file: ref?.file ?? null,
    source_file_sha256: ref?.fileSha256 ?? null,
    source_sheet: ref?.sheet ?? null,
    source_row: ref?.row ?? null,
    content_hash: stableHash(item.proposed ?? null),
  });
  if (error) throw new Error(error.message);
}

function record(ctx: Context, stage: StageName, item: PlanItem, status: RecordStatus, entityType: string, entityId: string | null, detail: string | null = null) {
  ctx.results.push({ stage, sourceKey: item.sourceKey, status, entityType, entityId, detail });
  return entityId;
}

/**
 * One record: source link → exact identity in the tenant → create. `ensure`
 * runs on every successful path so a record interrupted between its row and
 * its stock item is completed on the next run.
 */
/** Where each linked entity type lives. An opening balance links to its stock item. */
const LINKED_TABLE: Record<string, string> = {
  supplier: "vyron_cost_suppliers",
  ingredient: "vyron_cost_ingredients",
  product: "vyron_cost_products",
  bom: "vyron_cost_boms",
  opening_balance: "vyron_cost_stock_items",
};

/**
 * A source link is only proof of a previous import while the row it points at
 * still exists in this tenant. Rows can be removed outside this tool (the
 * developer reset centre deletes products and BOMs but knows nothing of
 * source links), and a stale link must not be read as "already imported".
 */
async function linkedRowExists(ctx: Context, entityType: string, id: string) {
  const table = LINKED_TABLE[entityType];
  if (!table) throw new Error(`No table is known for linked entity type "${entityType}".`);
  const { data, error } = await ctx.supabase.from(table).select("id").eq("company_id", ctx.companyId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  return entityType === "opening_balance" ? hasOpeningBalance(ctx.supabase, ctx.companyId, id) : true;
}

async function applyRecord(
  ctx: Context,
  stage: StageName,
  item: PlanItem,
  link: { entity: string; entityType: string },
  steps: { existing: () => Promise<string[]>; create: () => Promise<string>; ensure?: (id: string) => Promise<void> }
) {
  try {
    const linked = await findLink(ctx, link.entity, item.sourceKey);
    if (linked && !(await linkedRowExists(ctx, link.entityType, linked))) {
      // Fail closed: re-creating silently could duplicate data a person removed on purpose.
      return record(ctx, stage, item, "failed", link.entityType, linked, "Its source link points at a row that no longer exists in this tenant. Not re-created; review the link before re-importing.");
    }
    if (linked) {
      if (steps.ensure) await steps.ensure(linked);
      return record(ctx, stage, item, "already_imported", link.entityType, linked);
    }
    let targetId = item.action === "match" && item.targetId ? item.targetId : null;
    if (!targetId) {
      const existing = await steps.existing();
      if (existing.length > 1) return record(ctx, stage, item, "failed", link.entityType, null, `${existing.length} existing records share this identity; none is chosen.`);
      targetId = existing[0] || null;
    }
    if (targetId) {
      await writeLink(ctx, link.entity, item, link.entityType, targetId);
      if (steps.ensure) await steps.ensure(targetId);
      return record(ctx, stage, item, "linked_existing", link.entityType, targetId);
    }
    const id = await steps.create();
    await writeLink(ctx, link.entity, item, link.entityType, id);
    if (steps.ensure) await steps.ensure(id);
    return record(ctx, stage, item, "created", link.entityType, id);
  } catch (error) {
    return record(ctx, stage, item, "failed", link.entityType, null, error instanceof Error ? error.message : String(error));
  }
}

async function tenantRows(ctx: Context, table: string, columns: string) {
  const { data, error } = await ctx.supabase.from(table).select(columns).eq("company_id", ctx.companyId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data || []) as unknown as Record<string, unknown>[];
}

/* ------------------------------------------------------------- stages */

async function writeSuppliers(ctx: Context, items: PlanItem[]) {
  for (const item of items) {
    const p = proposedOf(item);
    const name = String(p.supplier_name);
    await applyRecord(ctx, "C_suppliers", item, { entity: "vendor", entityType: "supplier" }, {
      existing: async () =>
        (await tenantRows(ctx, "vyron_cost_suppliers", "id, supplier_name")).filter((row) => normalizeName(row.supplier_name) === normalizeName(name)).map((row) => String(row.id)),
      create: async () => {
        const id = randomUUID();
        const { error } = await ctx.supabase.from("vyron_cost_suppliers").insert({
          id,
          company_id: ctx.companyId,
          supplier_name: name,
          category: "Supplier",
          contact_email: text(p.contact_email),
          phone: text(p.phone),
          notes: p.contact_person ? `Contact person: ${p.contact_person}` : null,
        });
        if (error) throw new Error(error.message);
        await upsertVyronContact(ctx.supabase, ctx.companyId, { contact_name: name, email: text(p.contact_email), phone: text(p.phone), is_supplier: true });
        return id;
      },
    });
  }
}

async function writeCategories(ctx: Context, items: PlanItem[]) {
  for (const item of items) {
    const p = proposedOf(item);
    try {
      const { data: existing, error } = await ctx.supabase
        .from("vyron_cost_categories")
        .select("id")
        .eq("company_id", ctx.companyId)
        .eq("category_name", String(p.category_name))
        .eq("category_type", String(p.category_type))
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (existing?.id) {
        record(ctx, "B_categories", item, "linked_existing", "category", String(existing.id));
        continue;
      }
      const id = randomUUID();
      const insert = await ctx.supabase.from("vyron_cost_categories").insert({
        id,
        company_id: ctx.companyId,
        category_name: String(p.category_name),
        category_type: String(p.category_type),
        status: "Active",
        description: null,
      });
      if (insert.error) throw new Error(insert.error.message);
      record(ctx, "B_categories", item, "created", "category", id);
    } catch (error) {
      record(ctx, "B_categories", item, "failed", "category", null, error instanceof Error ? error.message : String(error));
    }
  }
}

async function writeStockItems(ctx: Context, items: PlanItem[]) {
  const supplierNames = new Map(ctx.plan.stages.C_suppliers.items.map((item) => [item.sourceKey, String(proposedOf(item).supplier_name || "")]));
  for (const item of items) {
    const p = proposedOf(item);
    const name = String(p.ingredient_name);
    const cost = Number(p.cost_per_unit);
    const unit = String(p.unit);
    let supplierId: string | null = null;
    const ensure = async (ingredientId: string) => {
      await findOrCreateStockItem(ctx.supabase, ctx.companyId, {
        entityType: p.stock_class === "raw_material" ? "ingredient" : "packaging",
        entityId: ingredientId,
        itemCode: `ING-${ingredientId.slice(0, 8).toUpperCase()}`,
        description: name,
        category: String(p.category || "Uncategorised"),
        unit,
        supplierId,
        supplierName: supplierId ? supplierNames.get(String(p.supplier_key)) || null : null,
        currentCost: cost,
        // Not in the source. 0 means "not set"; the writer's own defaults (10/5/500) would be invented.
        reorderLevel: 0,
        minLevel: 0,
        maxLevel: 0,
      });
    };
    await applyRecord(ctx, "E_stock_items", item, { entity: "product", entityType: "ingredient" }, {
      existing: async () =>
        (await tenantRows(ctx, "vyron_cost_ingredients", "id, ingredient_name")).filter((row) => normalizeName(row.ingredient_name) === normalizeName(name)).map((row) => String(row.id)),
      create: async () => {
        if (!(cost > 0)) throw new Error("Cost is not resolved; not written (VYRON would store 0).");
        if (p.supplier_key) {
          supplierId = await findLink(ctx, "vendor", String(p.supplier_key));
          if (!supplierId) throw new Error(`Its supplier (${p.supplier_key}) has not been imported.`);
        }
        const id = randomUUID();
        const { error } = await ctx.supabase.from("vyron_cost_ingredients").insert({
          id,
          company_id: ctx.companyId,
          ingredient_name: name,
          category: String(p.category || "Uncategorised"),
          supplier_id: supplierId,
          purchase_unit: unit,
          recipe_unit: unit,
          purchase_cost: cost,
          true_unit_cost: cost,
          previous_cost: null,
          yield_type: "Standard",
          yield_percent: 100,
          current_alert: null,
        });
        if (error) throw new Error(error.message);
        return id;
      },
      ensure,
    });
  }
}

async function writeFinishedGoods(ctx: Context, items: PlanItem[]) {
  for (const item of items) {
    const p = proposedOf(item);
    const name = String(p.product_name);
    const sku = text(p.sku);
    await applyRecord(ctx, "F_finished_goods", item, { entity: "product", entityType: "product" }, {
      existing: async () =>
        (await tenantRows(ctx, "vyron_cost_products", "id, product_name, sku"))
          .filter((row) => (sku ? row.sku && normalizeSku(row.sku) === normalizeSku(sku) : normalizeName(row.product_name) === normalizeName(name)))
          .map((row) => String(row.id)),
      create: async () => {
        const price = Number(p.selling_price);
        if (!(price > 0)) throw new Error("Selling price is not resolved; not written (VYRON would store 0).");
        const id = randomUUID();
        const status = String(p.product_status || "Active");
        const { error } = await ctx.supabase.from("vyron_cost_products").insert({
          id,
          company_id: ctx.companyId,
          product_name: name,
          sku,
          category: String(p.category || "General"),
          product_category: String(p.category || "General"),
          selling_price: price,
          // Not in the source; 0 = not set (the column default of 40 would be invented).
          target_gp: 0,
          product_status: status,
          status,
        });
        if (error) throw new Error(error.message);
        return id;
      },
      ensure: async (productId) => {
        await findOrCreateStockItem(ctx.supabase, ctx.companyId, {
          entityType: "finished_goods",
          entityId: productId,
          itemCode: `FG-${productId.slice(0, 8).toUpperCase()}`,
          description: name,
          category: String(p.category || "Finished Goods"),
          unit: String(p.unit || "unit"),
          reorderLevel: 0,
          minLevel: 0,
          maxLevel: 0,
        });
      },
    });
  }
}

async function writeBoms(ctx: Context, items: PlanItem[]) {
  const finishedByKey = new Map(ctx.plan.stages.F_finished_goods.items.map((item) => [item.sourceKey, proposedOf(item)]));
  for (const item of items) {
    const p = proposedOf(item);
    const finished = finishedByKey.get(String(p.finished_product_key)) || {};
    let productId: string | null = null;
    await applyRecord(ctx, "I_boms", item, { entity: "bom", entityType: "bom" }, {
      existing: async () => {
        productId = await findLink(ctx, "product", String(p.finished_product_key));
        if (!productId) return [];
        return (await tenantRows(ctx, "vyron_cost_boms", "id, product_id")).filter((row) => String(row.product_id) === productId).map((row) => String(row.id));
      },
      create: async () => {
        if (!productId) throw new Error(`Its finished product (${p.finished_product_key}) has not been imported.`);
        const lines = [];
        for (const [index, line] of ((p.lines as Proposed[]) || []).entries()) {
          const ingredientId = await findLink(ctx, "product", String(line.component_key));
          if (!ingredientId) throw new Error(`Component "${line.component_name}" has not been imported.`);
          if (!(Number(line.quantity) > 0) || !(Number(line.unit_cost) > 0)) throw new Error(`Component "${line.component_name}" has no resolved quantity or cost.`);
          lines.push({
            line_type: line.component_class === "raw_material" ? "Ingredient" : "Packaging",
            ingredient_id: ingredientId,
            line_name: String(line.component_name),
            quantity: Number(line.quantity),
            unit: String(line.unit),
            unit_cost: Number(line.unit_cost),
            wastage_percent: 0,
            sort_order: index,
          });
        }
        // The plan never lets an unpriced product through; refuse rather than let
        // createRecipe store a missing price as 0 if that ever changes.
        if (!(typeof finished.selling_price === "number" && finished.selling_price > 0)) throw new Error(`Its finished product (${p.finished_product_key}) has no resolved selling price.`);
        const rows = item.sources.map((source) => source.row);
        const { recipe } = await createRecipe(ctx.supabase, ctx.companyId, {
          recipe_name: String(p.bom_name),
          category: String(finished.category || "General"),
          yield_qty: 1,
          yield_unit: String(p.yield_unit || "unit"),
          target_gp: 0,
          selling_price: Number(finished.selling_price || 0),
          selling_price_includes_vat: finished.price_basis === "incl_vat",
          status: IMPORTED_BOM_STATUS,
          notes: `Imported from inFlow BOM rows ${Math.min(...rows)}–${Math.max(...rows)}; ${Number(p.inactive_lines_excluded || 0)} inactive line(s) excluded. Plan ${ctx.plan.planHash.slice(0, 12)}.`,
          product_id: productId,
          bom_purpose: "Finished Good",
          lines,
        });
        return recipe.id;
      },
    });
  }
}

async function writeOpeningStock(ctx: Context, items: PlanItem[]) {
  for (const item of items) {
    const p = proposedOf(item);
    let stockItemId: string | null = null;
    await applyRecord(ctx, "K_opening_stock", item, { entity: "stock_level", entityType: "opening_balance" }, {
      existing: async () => {
        const ingredientId = await findLink(ctx, "product", String(p.product_key));
        if (!ingredientId) throw new Error(`Its stock item (${p.product_key}) has not been imported.`);
        const { data, error } = await ctx.supabase.from("vyron_cost_stock_items").select("id").eq("company_id", ctx.companyId).eq("entity_id", ingredientId).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("The stock item row is missing.");
        stockItemId = String(data.id);
        return (await hasOpeningBalance(ctx.supabase, ctx.companyId, stockItemId)) ? [stockItemId] : [];
      },
      create: async () => {
        if (!stockItemId) throw new Error("No stock item.");
        if (!(Number(p.quantity) > 0) || !(Number(p.unit_cost) > 0)) throw new Error("Quantity or cost is not resolved; not posted.");
        await postOpeningStockMovement(ctx.supabase, {
          companyId: ctx.companyId,
          stockItemId,
          quantity: Number(p.quantity),
          unitCost: Number(p.unit_cost),
          referenceNote: `${p.label} Source row ${item.sources[0]?.row}; source quantity ${p.source_quantity} ${p.source_unit || p.unit}.`,
          actor: IMPORT_ACTOR,
        });
        return stockItemId;
      },
    });
  }
}

/* -------------------------------------------------------- reconciliation */

async function reconcile(ctx: Context, selected: Record<WritableStage, PlanItem[]>): Promise<ReconciliationFinding[]> {
  const findings: ReconciliationFinding[] = [];
  const done = new Map(ctx.results.filter((r) => r.status !== "failed").map((r) => [`${r.stage}|${r.sourceKey}`, r]));
  const differs = (stage: StageName, key: string, field: string, expected: unknown, actual: unknown, tolerance = 0) => {
    const mismatch = typeof expected === "number" ? !(Math.abs(Number(actual) - expected) <= tolerance) : String(expected ?? "") !== String(actual ?? "");
    if (mismatch) findings.push({ stage, sourceKey: key, field, expected, actual });
  };
  const byId = async (table: string, id: string) => {
    const { data } = await ctx.supabase.from(table).select("*").eq("company_id", ctx.companyId).eq("id", id).maybeSingle();
    return (data || null) as Proposed | null;
  };

  for (const item of selected.C_suppliers) {
    const done_ = done.get(`C_suppliers|${item.sourceKey}`);
    if (!done_?.entityId || done_.status !== "created") continue;
    const row = await byId("vyron_cost_suppliers", done_.entityId);
    differs("C_suppliers", item.sourceKey, "supplier_name", proposedOf(item).supplier_name, row?.supplier_name);
  }
  for (const item of selected.E_stock_items) {
    const done_ = done.get(`E_stock_items|${item.sourceKey}`);
    if (!done_?.entityId || done_.status !== "created") continue;
    const p = proposedOf(item);
    const row = await byId("vyron_cost_ingredients", done_.entityId);
    // purchase_cost is numeric(14,4). A cost with more decimals (the plan flags
    // it as precision_cost) is rounded by the column; that is reported by the
    // plan, not a reconciliation failure. Anything beyond half a unit of the
    // fourth decimal is.
    differs("E_stock_items", item.sourceKey, "purchase_cost", Number(p.cost_per_unit), row?.purchase_cost, 0.00005);
    differs("E_stock_items", item.sourceKey, "purchase_unit", p.unit, row?.purchase_unit);
    const { data: stock } = await ctx.supabase.from("vyron_cost_stock_items").select("id, unit").eq("company_id", ctx.companyId).eq("entity_id", done_.entityId).maybeSingle();
    if (!stock) findings.push({ stage: "E_stock_items", sourceKey: item.sourceKey, field: "stock_item", expected: "present", actual: "missing" });
  }
  for (const item of selected.F_finished_goods) {
    const done_ = done.get(`F_finished_goods|${item.sourceKey}`);
    if (!done_?.entityId || done_.status !== "created") continue;
    const p = proposedOf(item);
    const row = await byId("vyron_cost_products", done_.entityId);
    differs("F_finished_goods", item.sourceKey, "sku", p.sku ?? "", row?.sku ?? "");
    differs("F_finished_goods", item.sourceKey, "selling_price", Number(p.selling_price), row?.selling_price);
  }
  for (const item of selected.I_boms) {
    const done_ = done.get(`I_boms|${item.sourceKey}`);
    if (!done_?.entityId || done_.status !== "created") continue;
    const p = proposedOf(item);
    const planned = (p.lines as Proposed[]) || [];
    const { data: lines } = await ctx.supabase.from("vyron_cost_bom_lines").select("*").eq("company_id", ctx.companyId).eq("bom_id", done_.entityId);
    const stored = (lines || []) as Proposed[];
    differs("I_boms", item.sourceKey, "line_count", planned.length, stored.length);
    for (const line of planned) {
      const match = stored.find((row) => String(row.line_name) === String(line.component_name));
      differs("I_boms", item.sourceKey, `line:${line.component_name}:quantity`, Number(line.quantity), match?.quantity);
      differs("I_boms", item.sourceKey, `line:${line.component_name}:unit_cost`, Number(line.unit_cost), match?.unit_cost);
    }
    const bom = await byId("vyron_cost_boms", done_.entityId);
    if (p.computed_cost !== null && p.computed_cost !== undefined) differs("I_boms", item.sourceKey, "total_cost", Math.round(Number(p.computed_cost) * 100) / 100, bom?.total_cost, 0.005);
  }
  for (const item of selected.K_opening_stock) {
    const done_ = done.get(`K_opening_stock|${item.sourceKey}`);
    if (!done_?.entityId || done_.status !== "created") continue;
    const row = await byId("vyron_cost_stock_items", done_.entityId);
    // qty_on_hand is numeric(14,4): the plan already reported values finer than that.
    differs("K_opening_stock", item.sourceKey, "qty_on_hand", Number(proposedOf(item).quantity), row?.qty_on_hand, 0.00005);
  }
  return findings;
}

/* ------------------------------------------------------------------ entry */

export async function executeFoodSockPlan(
  supabase: SupabaseClient,
  plan: FoodSockPlan,
  options: ExecutionOptions
): Promise<ExecutionReport> {
  checkExecutionGates(plan, options);
  await preflight(supabase, options.companyId);
  const startedAt = new Date().toISOString();
  const selected = selectExecutionItems(plan, options.scope);

  /*
   * The run row is the in-database audit record. company_id is the tenant; the
   * first error_report entry is a structured approval record (nothing reads
   * vyron_import_runs.error_report as a list of errors, and the Import
   * Operations Centre ignores this entity type), completed when the run ends.
   */
  const approvalRecord = {
    kind: "execution_approval",
    tenant_id: options.companyId,
    plan_hash: plan.planHash,
    scope: options.scope,
    approver: options.approval.approver.trim(),
    acknowledgement: options.approval.acknowledgement,
    started_at: startedAt,
  };
  const run = await supabase
    .from("vyron_import_runs")
    .insert({
      company_id: options.companyId,
      entity_type: "food_sock_phase1",
      file_name: `plan ${plan.planHash} (${options.scope}); approved by ${approvalRecord.approver}`,
      status: "Running",
      valid_rows: 0,
      rejected_rows: 0,
      error_report: [approvalRecord],
    })
    .select("id")
    .single();
  if (run.error) throw new ExecutionRefused(`Could not open the import run: ${run.error.message}`);

  const ctx: Context = { supabase, companyId: options.companyId, plan, runId: String(run.data.id), results: [] };
  await writeSuppliers(ctx, selected.C_suppliers);
  await writeCategories(ctx, selected.B_categories);
  await writeStockItems(ctx, selected.E_stock_items);
  await writeFinishedGoods(ctx, selected.F_finished_goods);
  await writeBoms(ctx, selected.I_boms);
  await writeOpeningStock(ctx, selected.K_opening_stock);

  const reconciliation = await reconcile(ctx, selected);
  const counts: ExecutionReport["counts"] = {};
  for (const result of ctx.results) {
    counts[result.stage] ||= { created: 0, linked_existing: 0, already_imported: 0, failed: 0 };
    counts[result.stage][result.status] += 1;
  }
  const failed = ctx.results.filter((r) => r.status === "failed");
  const status = failed.length || reconciliation.length ? "Completed with issues" : "Completed";
  const totals = { created: 0, linked_existing: 0, already_imported: 0, failed: 0 };
  for (const result of ctx.results) totals[result.status] += 1;
  await supabase
    .from("vyron_import_runs")
    .update({
      status,
      valid_rows: ctx.results.length - failed.length,
      rejected_rows: failed.length,
      error_report: [
        { ...approvalRecord, finished_at: new Date().toISOString(), result: status, record_totals: totals, reconciliation_findings: reconciliation.length },
        ...failed.map((r) => ({ kind: "record_failed", stage: r.stage, source_key: r.sourceKey, error: r.detail })),
        ...reconciliation.map((f) => ({ kind: "reconciliation", ...f, error: "reconciliation" })),
      ],
    })
    .eq("id", ctx.runId)
    .eq("company_id", options.companyId);

  return { companyId: options.companyId, planHash: plan.planHash, scope: options.scope, runId: ctx.runId, startedAt, finishedAt: new Date().toISOString(), results: ctx.results, counts, reconciliation };
}
