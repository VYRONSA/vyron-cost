import type { SupabaseClient } from "@supabase/supabase-js";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export type StockEntityType = "ingredient" | "packaging" | "finished_goods";
export type StockStatus = "In Stock" | "Low Stock" | "Out Of Stock" | "Overstock" | "Slow Moving";
export type LedgerMovementType =
  | "Opening Balance"
  | "Purchase"
  | "GRN Receipt"
  | "GRN Reversal"
  | "Production Consumption"
  | "Production Completion"
  | "Adjustment"
  | "Transfer"
  | "Stock Count Variance"
  | "Manual Correction"
  | "Cost Update"
  | "Customer Sale"
  | "Customer Sale Reversal"
  | "Production Reversal";

export type StockItemRow = {
  id: string;
  company_id: string;
  item_code: string;
  description: string;
  category: string;
  entity_type: StockEntityType;
  entity_id: string | null;
  unit: string;
  supplier_id: string | null;
  supplier_name_snapshot: string | null;
  current_cost: number;
  average_cost: number;
  qty_on_hand: number;
  inventory_value: number;
  reorder_level: number;
  min_level: number;
  max_level: number;
  valuation_method: string;
  stock_status: StockStatus;
  last_movement_at: string | null;
};

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function computeStockStatus(
  item: Pick<StockItemRow, "qty_on_hand" | "reorder_level" | "min_level" | "max_level" | "last_movement_at">,
  slowDays = 30
): StockStatus {
  const qty = Number(item.qty_on_hand || 0);
  const reorder = Number(item.reorder_level || item.min_level || 0);
  const max = Number(item.max_level || 0);
  if (qty <= 0) return "Out Of Stock";
  if (reorder > 0 && qty <= reorder) return "Low Stock";
  if (max > 0 && qty > max) return "Overstock";
  if (item.last_movement_at) {
    const days = (Date.now() - new Date(item.last_movement_at).getTime()) / (1000 * 60 * 60 * 24);
    if (days >= slowDays) return "Slow Moving";
  }
  return "In Stock";
}

export async function writeInventoryAudit(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    stockItemId?: string;
    eventType: string;
    actor?: string;
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    detail?: string;
    referenceType?: string;
    referenceId?: string;
  }
) {
  await supabase.from("vyron_inventory_audit_log").insert({
    company_id: params.companyId,
    stock_item_id: params.stockItemId || null,
    event_type: params.eventType,
    actor: params.actor || "system",
    field_name: params.fieldName || null,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
    detail: params.detail || null,
    reference_type: params.referenceType || null,
    reference_id: params.referenceId || null,
  });
}

export async function getInventorySettings(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const { data } = await supabase.from("vyron_inventory_settings").select("*").eq("company_id", companyId).maybeSingle();
  return {
    minorVariancePct: Number(data?.minor_variance_pct ?? 2),
    majorVariancePct: Number(data?.major_variance_pct ?? 10),
    slowMovingDays30: Number(data?.slow_moving_days_30 ?? 30),
    slowMovingDays60: Number(data?.slow_moving_days_60 ?? 60),
    slowMovingDays90: Number(data?.slow_moving_days_90 ?? 90),
  };
}

function weightedAverageCost(oldQty: number, oldAvg: number, inQty: number, inCost: number) {
  const totalQty = oldQty + inQty;
  if (totalQty <= 0) return inCost;
  return round4((oldQty * oldAvg + inQty * inCost) / totalQty);
}

export async function findOrCreateStockItem(
  supabase: SupabaseClient,
  companyId: string,
  params: {
    entityType: StockEntityType;
    entityId?: string | null;
    itemCode: string;
    description: string;
    category?: string;
    unit?: string;
    supplierId?: string | null;
    supplierName?: string | null;
    currentCost?: number;
    reorderLevel?: number;
    minLevel?: number;
    maxLevel?: number;
  }
): Promise<StockItemRow> {
  if (params.entityType === "finished_goods" && params.entityId) {
    await assertCanonicalFinishedGoodsEntityId(supabase, companyId, params.entityId);
  }

  let query = supabase
    .from("vyron_cost_stock_items")
    .select("*")
    .eq("company_id", companyId)
    .eq("entity_type", params.entityType);

  if (params.entityId) {
    query = query.eq("entity_id", params.entityId);
  } else {
    query = query.eq("item_code", params.itemCode);
  }

  const { data: existing } = await query.maybeSingle();
  if (existing) return existing as StockItemRow;

  const payload = {
    company_id: companyId,
    item_code: params.itemCode,
    description: params.description,
    category: params.category || "Uncategorised",
    entity_type: params.entityType,
    entity_id: params.entityId || null,
    unit: params.unit || "kg",
    supplier_id: params.supplierId || null,
    supplier_name_snapshot: params.supplierName || null,
    current_cost: params.currentCost ?? 0,
    average_cost: params.currentCost ?? 0,
    reorder_level: params.reorderLevel ?? 10,
    min_level: params.minLevel ?? 5,
    max_level: params.maxLevel ?? 500,
    stock_status: "Out Of Stock" as StockStatus,
  };

  const { data, error } = await supabase.from("vyron_cost_stock_items").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  await writeInventoryAudit(supabase, {
    companyId,
    stockItemId: data.id as string,
    eventType: "Stock Item Created",
    detail: `Created stock item ${params.itemCode}`,
  });
  return data as StockItemRow;
}

export async function hasOpeningBalance(
  supabase: SupabaseClient,
  companyId: string,
  stockItemId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("vyron_cost_stock_ledger")
    .select("id")
    .eq("company_id", companyId)
    .eq("stock_item_id", stockItemId)
    .eq("movement_type", "Opening Balance")
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function postOpeningStockMovement(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    stockItemId: string;
    quantity: number;
    unitCost: number;
    movementDate?: string;
    referenceNote?: string;
    actor?: string;
    allowDuplicate?: boolean;
  }
) {
  if (params.quantity <= 0) {
    throw new Error("Opening quantity must be greater than zero.");
  }
  if (!params.allowDuplicate) {
    const exists = await hasOpeningBalance(supabase, params.companyId, params.stockItemId);
    if (exists) {
      throw new Error("Opening balance already posted for this stock item.");
    }
  }
  return postStockMovement(supabase, {
    companyId: params.companyId,
    stockItemId: params.stockItemId,
    movementType: "Opening Balance",
    quantityIn: params.quantity,
    unitCost: params.unitCost,
    referenceType: "opening_stock",
    referenceLabel: params.referenceNote || "Opening balance",
    actor: params.actor || "user",
    movementDate: params.movementDate,
    updateAverageOnReceipt: true,
    metadata: params.referenceNote ? { note: params.referenceNote } : {},
  });
}

export async function postStockMovement(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    stockItemId: string;
    movementType: LedgerMovementType;
    quantityIn?: number;
    quantityOut?: number;
    unitCost: number;
    referenceType?: string;
    referenceId?: string;
    referenceLabel?: string;
    actor?: string;
    metadata?: Record<string, unknown>;
    updateAverageOnReceipt?: boolean;
    movementDate?: string;
    allowNegative?: boolean;
  }
) {
  const { data: item, error: loadErr } = await supabase
    .from("vyron_cost_stock_items")
    .select("*")
    .eq("id", params.stockItemId)
    .single();
  if (loadErr || !item) throw new Error(loadErr?.message || "Stock item not found");
  if (String(item.company_id) !== String(params.companyId)) {
    throw new Error("Stock item does not belong to the active company.");
  }

  const qtyIn = round4(params.quantityIn || 0);
  const qtyOut = round4(params.quantityOut || 0);
  const oldQty = round4(Number(item.qty_on_hand || 0));
  const oldAvg = Number(item.average_cost || item.current_cost || 0);
  const unitCost = round4(params.unitCost);

  const projectedQty = round4(oldQty + qtyIn - qtyOut);
  if (projectedQty < 0 && !params.allowNegative) {
    throw new Error(`Insufficient stock: available ${oldQty}, required ${qtyOut}.`);
  }
  let newQty = projectedQty;
  if (newQty < 0) newQty = 0;

  let newAvg = oldAvg;
  let newCurrent = Number(item.current_cost || 0);
  if (params.movementType === "Cost Update") {
    newCurrent = unitCost;
    newAvg = unitCost > 0 ? unitCost : oldAvg;
  } else if (qtyIn > 0 && params.updateAverageOnReceipt !== false) {
    newAvg = weightedAverageCost(oldQty, oldAvg, qtyIn, unitCost);
    newCurrent = unitCost;
  }

  const value = round2(newQty * newAvg);
  const movementValue = round2(qtyIn * unitCost - qtyOut * unitCost);

  const { error: ledgerErr } = await supabase.from("vyron_cost_stock_ledger").insert({
    company_id: params.companyId,
    stock_item_id: params.stockItemId,
    movement_date: params.movementDate || new Date().toISOString(),
    movement_type: params.movementType,
    quantity_in: qtyIn,
    quantity_out: qtyOut,
    balance_after: newQty,
    unit_cost: unitCost,
    value: movementValue,
    reference_type: params.referenceType || null,
    reference_id: params.referenceId || null,
    reference_label: params.referenceLabel || null,
    actor: params.actor || "system",
    metadata: params.metadata || {},
  });
  if (ledgerErr) throw new Error(ledgerErr.message);

  const settings = await getInventorySettings(supabase, params.companyId);
  const status = computeStockStatus(
    {
      qty_on_hand: newQty,
      reorder_level: item.reorder_level,
      min_level: item.min_level,
      max_level: item.max_level,
      last_movement_at: new Date().toISOString(),
    },
    settings.slowMovingDays30
  );

  const { error: updErr } = await supabase
    .from("vyron_cost_stock_items")
    .update({
      qty_on_hand: newQty,
      average_cost: newAvg,
      current_cost: newCurrent,
      inventory_value: value,
      stock_status: status,
      last_movement_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.stockItemId);
  if (updErr) throw new Error(updErr.message);

  await refreshLowStockAlert(supabase, params.companyId, params.stockItemId);

  return { newQty, newAvg, newCurrent, value, status };
}

export async function refreshLowStockAlert(supabase: SupabaseClient, companyId: string, stockItemId: string) {
  const { data: item } = await supabase.from("vyron_cost_stock_items").select("*").eq("id", stockItemId).maybeSingle();
  if (!item) return;
  const qty = Number(item.qty_on_hand || 0);
  const reorder = Number(item.reorder_level || 0);
  if (reorder <= 0 || qty > reorder) {
    await supabase
      .from("vyron_cost_low_stock_alerts")
      .update({ status: "Resolved", resolved_at: new Date().toISOString() })
      .eq("stock_item_id", stockItemId)
      .eq("status", "Open");
    return;
  }
  const required = Math.max(0, reorder - qty);
  const estimated = round2(required * Number(item.average_cost || item.current_cost || 0));
  const { data: existing } = await supabase
    .from("vyron_cost_low_stock_alerts")
    .select("id")
    .eq("stock_item_id", stockItemId)
    .eq("status", "Open")
    .maybeSingle();
  const payload = {
    company_id: companyId,
    stock_item_id: stockItemId,
    required_qty: required,
    estimated_cost: estimated,
    preferred_supplier_id: item.supplier_id,
    preferred_supplier_name: item.supplier_name_snapshot,
    status: "Open",
  };
  if (existing) {
    await supabase.from("vyron_cost_low_stock_alerts").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("vyron_cost_low_stock_alerts").insert(payload);
  }
}

export async function syncStockItemsFromMasters(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const [{ data: ingredients }, { data: products }] = await Promise.all([
    supabase.from("vyron_cost_ingredients").select("id, ingredient_name, category, purchase_unit, purchase_cost, supplier_id").eq("company_id", companyId),
    supabase.from("vyron_cost_products").select("id, product_name, category, total_cost").eq("company_id", companyId),
  ]);

  let created = 0;
  for (const ing of ingredients || []) {
    const cat = String(ing.category || "").toLowerCase();
    const entityType: StockEntityType = cat.includes("pack") ? "packaging" : "ingredient";
    const code = `ING-${String(ing.id).slice(0, 8).toUpperCase()}`;
    const { data: exists } = await supabase
      .from("vyron_cost_stock_items")
      .select("id")
      .eq("company_id", companyId)
      .eq("entity_id", ing.id)
      .maybeSingle();
    if (!exists) {
      await findOrCreateStockItem(supabase, companyId, {
        entityType,
        entityId: ing.id as string,
        itemCode: code,
        description: String(ing.ingredient_name),
        category: String(ing.category || "Ingredient"),
        unit: String(ing.purchase_unit || "kg"),
        supplierId: (ing.supplier_id as string) || null,
        currentCost: Number(ing.purchase_cost || 0),
        reorderLevel: 20,
        minLevel: 10,
        maxLevel: 200,
      });
      created += 1;
    }
  }

  for (const prod of products || []) {
    const code = `FG-${String(prod.id).slice(0, 8).toUpperCase()}`;
    const { data: exists } = await supabase
      .from("vyron_cost_stock_items")
      .select("id")
      .eq("company_id", companyId)
      .eq("entity_id", prod.id)
      .maybeSingle();
    if (!exists) {
      await findOrCreateStockItem(supabase, companyId, {
        entityType: "finished_goods",
        entityId: prod.id as string,
        itemCode: code,
        description: String(prod.product_name),
        category: String(prod.category || "Finished Goods"),
        unit: "unit",
        currentCost: Number(prod.total_cost || 0),
        reorderLevel: 50,
        minLevel: 20,
        maxLevel: 1000,
      });
      created += 1;
    }
  }

  return { created, ingredientCount: ingredients?.length || 0, productCount: products?.length || 0 };
}

export async function hasGrnPostedStock(
  supabase: SupabaseClient,
  companyId: string,
  grnId: string
): Promise<boolean> {
  const [{ count: receiptCount, error: receiptError }, { count: reversalCount, error: reversalError }] =
    await Promise.all([
      supabase
        .from("vyron_cost_stock_ledger")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("reference_type", "goods_receipt")
        .eq("reference_id", grnId)
        .eq("movement_type", "GRN Receipt"),
      supabase
        .from("vyron_cost_stock_ledger")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("reference_id", grnId)
        .eq("movement_type", "GRN Reversal"),
    ]);
  if (receiptError) throw new Error(receiptError.message);
  if (reversalError) throw new Error(reversalError.message);
  return (receiptCount || 0) > 0 && (reversalCount || 0) === 0;
}

export async function hasGrnReversalPosted(
  supabase: SupabaseClient,
  companyId: string,
  grnId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from("vyron_cost_stock_ledger")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("reference_id", grnId)
    .eq("movement_type", "GRN Reversal");
  if (error) throw new Error(error.message);
  return (count || 0) > 0;
}

/** Reject new stock writes keyed by vyron_finished_goods.id instead of product_id. */
export async function assertCanonicalFinishedGoodsEntityId(
  supabase: SupabaseClient,
  companyId: string,
  entityId: string
) {
  const { data: product, error: productError } = await supabase
    .from("vyron_cost_products")
    .select("id")
    .eq("id", entityId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (productError) throw new Error(productError.message);
  if (product) return;

  const { data: finishedGood, error: fgError } = await supabase
    .from("vyron_finished_goods")
    .select("id")
    .eq("id", entityId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (fgError) throw new Error(fgError.message);
  if (finishedGood) {
    throw new Error(
      "Legacy finished goods stock bucket detected. Use product_id for stock operations and run the legacy FG migration report."
    );
  }
}

export type LegacyFgStockBucketRow = {
  stockItemId: string;
  itemCode: string;
  description: string;
  legacyEntityId: string;
  suggestedProductId: string | null;
  suggestedProductName: string | null;
  qtyOnHand: number;
  inventoryValue: number;
};

export type LegacyFgStockMigrationReport = {
  companyId: string;
  legacyBuckets: LegacyFgStockBucketRow[];
  canonicalProductBuckets: number;
  legacyQtyTotal: number;
  legacyValueTotal: number;
  generatedAt: string;
};

export async function detectLegacyFinishedGoodsStockBuckets(
  supabase: SupabaseClient,
  companyId: string
): Promise<LegacyFgStockMigrationReport> {
  const [{ data: stockItems, error: stockError }, { data: products, error: productError }, finishedGoods] =
    await Promise.all([
      supabase
        .from("vyron_cost_stock_items")
        .select("id, item_code, description, entity_id, qty_on_hand, inventory_value")
        .eq("company_id", companyId)
        .eq("entity_type", "finished_goods"),
      supabase.from("vyron_cost_products").select("id, product_name, sku").eq("company_id", companyId),
      listVyronFinishedGoods(supabase, companyId),
    ]);
  if (stockError) throw new Error(stockError.message);
  if (productError) throw new Error(productError.message);

  const productIds = new Set((products || []).map((row) => String(row.id)));
  const finishedGoodById = new Map(finishedGoods.map((row) => [row.id, row]));
  const productByName = new Map(
    (products || []).map((row) => [String(row.product_name || "").toLowerCase(), row])
  );
  const productBySku = new Map((products || []).map((row) => [String(row.sku || "").toLowerCase(), row]));

  const legacyBuckets: LegacyFgStockBucketRow[] = [];
  let canonicalProductBuckets = 0;

  for (const item of stockItems || []) {
    const entityId = String(item.entity_id || "");
    if (!entityId) continue;
    if (productIds.has(entityId)) {
      canonicalProductBuckets += 1;
      continue;
    }

    const fg = finishedGoodById.get(entityId);
    if (!fg) continue;

    const fgName = fg.product_name.toLowerCase();
    const fgCode = fg.product_code.toLowerCase();
    const suggested =
      productByName.get(fgName) ||
      (fgCode ? productBySku.get(fgCode) : null) ||
      (products || []).find((row) => String(row.sku || "").toLowerCase() === fgName) ||
      null;

    legacyBuckets.push({
      stockItemId: String(item.id),
      itemCode: String(item.item_code || ""),
      description: String(item.description || fg.product_name),
      legacyEntityId: entityId,
      suggestedProductId: suggested ? String(suggested.id) : null,
      suggestedProductName: suggested ? String(suggested.product_name) : null,
      qtyOnHand: Number(item.qty_on_hand || 0),
      inventoryValue: Number(item.inventory_value || 0),
    });
  }

  const legacyQtyTotal = round4(legacyBuckets.reduce((sum, row) => sum + row.qtyOnHand, 0));
  const legacyValueTotal = round2(legacyBuckets.reduce((sum, row) => sum + row.inventoryValue, 0));

  return {
    companyId,
    legacyBuckets,
    canonicalProductBuckets,
    legacyQtyTotal,
    legacyValueTotal,
    generatedAt: new Date().toISOString(),
  };
}

/** Remove partial stock postings when GRN creation fails before completion. */
export async function rollbackGrnStockPostings(
  supabase: SupabaseClient,
  companyId: string,
  grnId: string
) {
  const { data: movements, error } = await supabase
    .from("vyron_cost_stock_ledger")
    .select("*")
    .eq("company_id", companyId)
    .eq("reference_type", "goods_receipt")
    .eq("reference_id", grnId)
    .eq("movement_type", "GRN Receipt");
  if (error) throw new Error(error.message);

  for (const movement of movements || []) {
    const qtyIn = round4(Number(movement.quantity_in || 0));
    if (qtyIn <= 0) continue;

    const { data: item, error: itemError } = await supabase
      .from("vyron_cost_stock_items")
      .select("*")
      .eq("id", movement.stock_item_id)
      .maybeSingle();
    if (itemError) throw new Error(itemError.message);
    if (item) {
      const newQty = round4(Math.max(0, Number(item.qty_on_hand || 0) - qtyIn));
      const avg = Number(item.average_cost || item.current_cost || 0);
      await supabase
        .from("vyron_cost_stock_items")
        .update({
          qty_on_hand: newQty,
          inventory_value: round2(newQty * avg),
          stock_status: computeStockStatus({ ...item, qty_on_hand: newQty }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
    }

    await supabase.from("vyron_cost_stock_ledger").delete().eq("id", movement.id);
  }
}

export async function reverseStockFromGrn(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    grnId: string;
    grnNumber: string;
    reason: string;
    actor?: string;
  }
) {
  const reason = params.reason.trim();
  if (!reason) throw new Error("Reversal reason is required.");

  if (await hasGrnReversalPosted(supabase, params.companyId, params.grnId)) {
    throw new Error("GRN stock has already been reversed.");
  }

  const { data: receiptMovements, error } = await supabase
    .from("vyron_cost_stock_ledger")
    .select("*")
    .eq("company_id", params.companyId)
    .eq("reference_type", "goods_receipt")
    .eq("reference_id", params.grnId)
    .eq("movement_type", "GRN Receipt");
  if (error) throw new Error(error.message);
  if (!receiptMovements?.length) {
    throw new Error("No stock movements found for this GRN.");
  }

  const actor = params.actor || "user";
  const reversedAt = new Date().toISOString();

  for (const movement of receiptMovements) {
    const qtyIn = round4(Number(movement.quantity_in || 0));
    if (qtyIn <= 0) continue;

    await postStockMovement(supabase, {
      companyId: params.companyId,
      stockItemId: String(movement.stock_item_id),
      movementType: "GRN Reversal",
      quantityOut: qtyIn,
      unitCost: Number(movement.unit_cost || 0),
      referenceType: "goods_receipt_reversal",
      referenceId: params.grnId,
      referenceLabel: params.grnNumber,
      actor,
      allowNegative: true,
      metadata: {
        reason,
        originalGrnId: params.grnId,
        originalGrnNumber: params.grnNumber,
        originalMovementId: movement.id,
        reversedAt,
      },
    });

    await writeInventoryAudit(supabase, {
      companyId: params.companyId,
      stockItemId: String(movement.stock_item_id),
      eventType: "GRN Reversal",
      actor,
      detail: `GRN reversal ${params.grnNumber}: -${qtyIn} — ${reason}`,
      referenceType: "goods_receipt_reversal",
      referenceId: params.grnId,
    });
  }
}

export async function receiveStockFromGrn(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    grnId: string;
    grnNumber: string;
    purchaseOrderId: string;
    lines: Array<{
      purchase_order_line_id?: string | null;
      item_name: string;
      received_qty: number;
      unit: string;
      item_type?: string;
      item_id?: string | null;
      unit_price?: number;
    }>;
    actor?: string;
  }
) {
  const poLines = await supabase
    .from("vyron_cost_purchase_order_lines")
    .select("*")
    .eq("purchase_order_id", params.purchaseOrderId)
    .eq("company_id", params.companyId);

  const poLineMap = new Map((poLines.data || []).map((l) => [l.id as string, l]));

  for (const line of params.lines) {
    if (line.received_qty <= 0) continue;
    const poLine = line.purchase_order_line_id ? poLineMap.get(line.purchase_order_line_id) : null;
    const itemType = (line.item_type || poLine?.item_type || "ingredient") as string;
    if (itemType === "non_stock") continue;
    const entityType: StockEntityType =
      itemType === "product" ? "finished_goods" : itemType === "packaging" ? "packaging" : "ingredient";
    const entityId = (line.item_id || poLine?.item_id) as string | null;
    const unitCost = Number(line.unit_price ?? poLine?.unit_price ?? 0);
    const stockItem = await findOrCreateStockItem(supabase, params.companyId, {
      entityType,
      entityId,
      itemCode: entityId ? `${entityType.slice(0, 3).toUpperCase()}-${entityId.slice(0, 8)}` : `NS-${line.item_name.slice(0, 12)}`,
      description: line.item_name,
      unit: line.unit || String(poLine?.unit || "kg"),
      currentCost: unitCost,
    });

    await postStockMovement(supabase, {
      companyId: params.companyId,
      stockItemId: stockItem.id,
      movementType: "GRN Receipt",
      quantityIn: line.received_qty,
      unitCost,
      referenceType: "goods_receipt",
      referenceId: params.grnId,
      referenceLabel: params.grnNumber,
      actor: params.actor,
    });

    await writeInventoryAudit(supabase, {
      companyId: params.companyId,
      stockItemId: stockItem.id,
      eventType: "GRN Receipt",
      actor: params.actor,
      detail: `Received ${line.received_qty} ${line.unit} from ${params.grnNumber}`,
      referenceType: "goods_receipt",
      referenceId: params.grnId,
    });
  }
}

export async function updateStockCostsFromApprovedInvoice(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    documentId: string;
    invoiceNumber?: string | null;
    lines: Array<{
      matched_entity_type?: string | null;
      matched_entity_id?: string | null;
      description?: string | null;
      unit_price?: number | null;
      ignored?: boolean;
    }>;
    actor?: string;
  }
) {
  for (const line of params.lines) {
    if (line.ignored || !line.matched_entity_id || !line.matched_entity_type) continue;
    const entityType: StockEntityType =
      line.matched_entity_type === "product"
        ? "finished_goods"
        : line.matched_entity_type === "packaging"
          ? "packaging"
          : "ingredient";

    const { data: stockItem } = await supabase
      .from("vyron_cost_stock_items")
      .select("id")
      .eq("company_id", params.companyId)
      .eq("entity_type", entityType)
      .eq("entity_id", line.matched_entity_id)
      .maybeSingle();

    if (!stockItem) continue;
    const unitCost = Number(line.unit_price || 0);
    if (unitCost <= 0) continue;

    const { data: before } = await supabase.from("vyron_cost_stock_items").select("current_cost").eq("id", stockItem.id).single();

    await postStockMovement(supabase, {
      companyId: params.companyId,
      stockItemId: stockItem.id,
      movementType: "Cost Update",
      unitCost,
      referenceType: "document",
      referenceId: params.documentId,
      referenceLabel: params.invoiceNumber || params.documentId,
      actor: params.actor,
      updateAverageOnReceipt: false,
    });

    await writeInventoryAudit(supabase, {
      companyId: params.companyId,
      stockItemId: stockItem.id,
      eventType: "Invoice Cost Update",
      actor: params.actor,
      fieldName: "current_cost",
      oldValue: String(before?.current_cost ?? 0),
      newValue: String(unitCost),
      referenceType: "document",
      referenceId: params.documentId,
    });
  }
}

export type VyronFinishedGoodRow = {
  id: string;
  company_id: string | null;
  product_code: string;
  product_name: string;
  category: string | null;
  standard_cost: number;
  latest_actual_cost: number;
  selling_price: number;
  active: boolean;
  current_stock?: number | null;
  stock_value?: number | null;
  sales_velocity_30_days?: number | null;
  days_cover?: number | null;
  stock_status?: string | null;
  last_manufactured_at?: string | null;
};

export type VyronStockMovementRow = {
  id: string;
  company_id: string | null;
  movement_date: string;
  item_type: string;
  item_id: string;
  item_name: string;
  movement_type: string;
  reference_number: string;
  quantity_in: number;
  quantity_out: number;
  unit_cost: number;
  total_value: number;
  notes: string | null;
};

function finishedGoodStockValue(row: VyronFinishedGoodRow): number {
  const explicit = Number(row.stock_value ?? 0);
  if (explicit > 0) return explicit;
  const qty = Number(row.current_stock || 0);
  const cost = Number(row.latest_actual_cost || row.standard_cost || 0);
  return round2(qty * cost);
}

export type StockBackedFinishedGoodOption = {
  productId: string;
  productName: string;
  sku: string;
  stockOnHand: number;
  unitCost: number;
  sellingPrice: number;
  inventoryValue: number;
  stockStatus?: string | null;
};

/** Finished goods for invoice picker — canonical qty from vyron_cost_stock_items keyed by product_id. */
export async function listStockBackedFinishedGoodsForInvoice(
  supabase: SupabaseClient,
  companyId: string
): Promise<StockBackedFinishedGoodOption[]> {
  const { data: stockItems, error } = await supabase
    .from("vyron_cost_stock_items")
    .select("*")
    .eq("company_id", companyId)
    .eq("entity_type", "finished_goods")
    .order("description");
  if (error) throw new Error(error.message);

  const productIds = Array.from(
    new Set((stockItems || []).map((item) => String(item.entity_id || "")).filter(Boolean))
  );

  const { data: products, error: productError } = productIds.length
    ? await supabase
        .from("vyron_cost_products")
        .select("id, product_name, sku, selling_price, total_cost, product_status")
        .eq("company_id", companyId)
        .in("id", productIds)
    : { data: [], error: null };
  if (productError) throw new Error(productError.message);

  const productById = new Map((products || []).map((product) => [String(product.id), product]));

  const results: StockBackedFinishedGoodOption[] = [];
  for (const item of stockItems || []) {
    const productId = String(item.entity_id || "");
    if (!productId) continue;
    const product = productById.get(productId);
    if (product && String(product.product_status || "") === "Archived") continue;

    results.push({
      productId,
      productName: String(product?.product_name || item.description || "Finished Good"),
      sku: String(product?.sku || item.item_code || ""),
      stockOnHand: Number(item.qty_on_hand || 0),
      unitCost: Number(item.average_cost || product?.total_cost || 0),
      sellingPrice: Number(product?.selling_price || 0),
      inventoryValue: Number(item.inventory_value || 0),
      stockStatus: item.stock_status as string | null | undefined,
    });
  }

  return results.sort((a, b) => a.productName.localeCompare(b.productName));
}

export async function listVyronFinishedGoods(supabase: SupabaseClient, companyId: string) {
  const scoped = await supabase
    .from("vyron_finished_goods")
    .select("*")
    .eq("company_id", companyId)
    .order("product_name");
  if (!scoped.error) {
    let rows = (scoped.data || []) as VyronFinishedGoodRow[];
    if (rows.some((row) => "active" in row)) {
      rows = rows.filter((row) => row.active !== false);
    }
    return rows;
  }

  const { data, error } = await supabase.from("vyron_finished_goods").select("*").order("product_name");
  if (error) throw new Error(error.message);
  let rows = (data || []) as VyronFinishedGoodRow[];
  if (!rows.some((row) => row.company_id != null && String(row.company_id).trim() !== "")) {
    return [];
  }
  rows = rows.filter((row) => row.company_id === companyId);
  if (rows.some((row) => "active" in row)) {
    rows = rows.filter((row) => row.active !== false);
  }
  return rows;
}

export async function getVyronFinishedGoodsInventoryValue(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const rows = await listVyronFinishedGoods(supabase, companyId);
  return round2(rows.reduce((sum, row) => sum + finishedGoodStockValue(row), 0));
}

export async function listVyronStockMovements(supabase: SupabaseClient, companyId: string) {
  const scoped = await supabase
    .from("vyron_stock_movements")
    .select("*")
    .eq("company_id", companyId)
    .order("movement_date", { ascending: false });
  if (!scoped.error) return (scoped.data || []) as VyronStockMovementRow[];

  const { data, error } = await supabase
    .from("vyron_stock_movements")
    .select("*")
    .order("movement_date", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data || []) as VyronStockMovementRow[];
  if (!rows.some((row) => row.company_id != null && String(row.company_id).trim() !== "")) {
    return [];
  }
  return rows.filter((row) => row.company_id === companyId);
}

export async function getInventoryDashboardStats(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const { data: items } = await supabase.from("vyron_cost_stock_items").select("*").eq("company_id", companyId);
  const rows = (items || []) as StockItemRow[];

  const sumByType = (type: StockEntityType) =>
    rows.filter((r) => r.entity_type === type).reduce((s, r) => s + Number(r.inventory_value || 0), 0);

  const lowStock = rows.filter((r) => r.stock_status === "Low Stock").length;
  const outOfStock = rows.filter((r) => r.stock_status === "Out Of Stock").length;
  const overstock = rows.filter((r) => r.stock_status === "Overstock").length;
  const slowMoving = rows.filter((r) => r.stock_status === "Slow Moving").length;

  const { data: openCounts } = await supabase
    .from("vyron_cost_stock_counts")
    .select("variance_value_total")
    .eq("company_id", companyId)
    .eq("status", "Posted")
    .order("posted_at", { ascending: false })
    .limit(12);

  const varianceValue = (openCounts || []).reduce((s, c) => s + Math.abs(Number(c.variance_value_total || 0)), 0);

  const ingredientsValue = round2(sumByType("ingredient"));
  const packagingValue = round2(sumByType("packaging"));
  const rawMaterialValue = round2(ingredientsValue + packagingValue);
  const finishedGoodsValue = await getVyronFinishedGoodsInventoryValue(supabase, companyId);
  const totalValue = round2(rawMaterialValue + finishedGoodsValue);
  const negativeStockRisks = rows.filter((r) => Number(r.qty_on_hand || 0) < 0).length;

  let turnover = 0;
  const { data: ledgerOut } = await supabase
    .from("vyron_cost_stock_ledger")
    .select("value")
    .eq("company_id", companyId)
    .gt("quantity_out", 0)
    .gte("movement_date", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
  const cogs90 = (ledgerOut || []).reduce((s, l) => s + Math.abs(Number(l.value || 0)), 0);
  if (totalValue > 0) turnover = round2(cogs90 / totalValue);

  return {
    totalInventoryValue: totalValue,
    ingredientsValue,
    packagingValue,
    rawMaterialValue,
    finishedGoodsValue,
    lowStockItems: lowStock,
    outOfStockItems: outOfStock,
    overstockItems: overstock,
    slowMovingItems: slowMoving,
    negativeStockRisks,
    inventoryVarianceValue: round2(varianceValue),
    stockTurnover: turnover,
    inventoryTurns: turnover,
    itemCount: rows.length,
  };
}

export async function listStockItems(
  supabase: SupabaseClient,
  companyId = VYRON_DEFAULT_TENANT_ID,
  filters?: { entityType?: string; status?: string; search?: string }
) {
  let query = supabase.from("vyron_cost_stock_items").select("*").eq("company_id", companyId).order("description");
  if (filters?.entityType && filters.entityType !== "all") {
    query = query.eq("entity_type", filters.entityType);
  }
  if (filters?.status && filters.status !== "all") {
    query = query.eq("stock_status", filters.status);
  }
  const { data, error } = await query.limit(1000);
  if (error) throw new Error(error.message);
  let rows = (data || []) as StockItemRow[];
  if (filters?.search?.trim()) {
    const t = filters.search.trim().toLowerCase();
    rows = rows.filter((r) => [r.item_code, r.description, r.category].join(" ").toLowerCase().includes(t));
  }
  return rows;
}

export async function getStockLedger(
  supabase: SupabaseClient,
  companyId: string,
  opts?: { stockItemId?: string; limit?: number }
) {
  let query = supabase
    .from("vyron_cost_stock_ledger")
    .select("*, vyron_cost_stock_items(item_code, description, unit)")
    .eq("company_id", companyId)
    .order("movement_date", { ascending: false })
    .limit(opts?.limit ?? 200);
  if (opts?.stockItemId) query = query.eq("stock_item_id", opts.stockItemId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createStockCount(
  supabase: SupabaseClient,
  companyId: string,
  countType: "ingredients" | "packaging" | "finished_goods",
  createdBy = "user",
  metadata?: {
    notes?: string;
    warehouseName?: string;
    locationName?: string;
  }
) {
  const entityMap = { ingredients: "ingredient", packaging: "packaging", finished_goods: "finished_goods" } as const;
  const entityType = entityMap[countType];

  let items = await listStockItems(supabase, companyId, { entityType });

  if (items.length === 0) {
    await syncStockItemsFromMasters(supabase, companyId);
    items = await listStockItems(supabase, companyId, { entityType });
  }

  if (items.length === 0) {
    throw new Error(`No ${countType.replaceAll("_", " ")} stock items found. Add stock items or run the inventory demo seed before creating this count.`);
  }

  const countNumber = `CNT-${Date.now().toString().slice(-8)}`;

  const { data: header, error } = await supabase
    .from("vyron_cost_stock_counts")
    .insert({
      company_id: companyId,
      count_number: countNumber,
      count_type: countType,
      status: "Draft",
      created_by: createdBy,
      notes: [metadata?.notes, metadata?.warehouseName ? `Warehouse: ${metadata.warehouseName}` : null, metadata?.locationName ? `Location: ${metadata.locationName}` : null]
        .filter(Boolean)
        .join(" | ") || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const lines = items.map((item) => ({
    company_id: companyId,
    stock_count_id: header.id,
    stock_item_id: item.id,
    system_qty: Number(item.qty_on_hand || 0),
    counted_qty: Number(item.qty_on_hand || 0),
    unit_cost: Number(item.average_cost || item.current_cost || 0),
    variance_qty: 0,
    variance_pct: 0,
    variance_value: 0,
    variance_class: "minor",
  }));

  const { error: lineErr } = await supabase.from("vyron_cost_stock_count_lines").insert(lines);
  if (lineErr) throw new Error(lineErr.message);

  await writeInventoryAudit(supabase, {
    companyId,
    eventType: "Stock Count Created",
    actor: createdBy,
    detail: `${countNumber} created for ${countType} with ${lines.length} line(s).`,
    referenceType: "stock_count",
    referenceId: header.id as string,
  });

  return { count: header, lineCount: lines.length };
}

export async function updateStockCountLine(
  supabase: SupabaseClient,
  companyId: string,
  lineId: string,
  countedQty: number
) {
  const { data: line } = await supabase
    .from("vyron_cost_stock_count_lines")
    .select("*")
    .eq("id", lineId)
    .eq("company_id", companyId)
    .single();
  if (!line) throw new Error("Line not found");
  const settings = await getInventorySettings(supabase, line.company_id as string);
  const systemQty = Number(line.system_qty || 0);
  const varianceQty = round4(countedQty - systemQty);
  const variancePct = systemQty > 0 ? round4((varianceQty / systemQty) * 100) : countedQty > 0 ? 100 : 0;
  const unitCost = Number(line.unit_cost || 0);
  const varianceValue = round2(varianceQty * unitCost);
  const varianceClass = Math.abs(variancePct) >= settings.majorVariancePct ? "major" : "minor";

  await supabase
    .from("vyron_cost_stock_count_lines")
    .update({
      counted_qty: countedQty,
      variance_qty: varianceQty,
      variance_pct: variancePct,
      variance_value: varianceValue,
      variance_class: varianceClass,
    })
    .eq("id", lineId);
}

export async function getStockCountForCompany(supabase: SupabaseClient, companyId: string, countId: string) {
  const { data: header, error } = await supabase
    .from("vyron_cost_stock_counts")
    .select("*")
    .eq("id", countId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!header) throw new Error("Count not found.");
  return header;
}

export async function submitStockCount(supabase: SupabaseClient, companyId: string, countId: string) {
  await getStockCountForCompany(supabase, companyId, countId);
  const { data: lines } = await supabase
    .from("vyron_cost_stock_count_lines")
    .select("variance_value")
    .eq("stock_count_id", countId)
    .eq("company_id", companyId);
  const totalVar = round2((lines || []).reduce((s, l) => s + Math.abs(Number(l.variance_value || 0)), 0));
  await supabase
    .from("vyron_cost_stock_counts")
    .update({ status: "Submitted", submitted_at: new Date().toISOString(), variance_value_total: totalVar, updated_at: new Date().toISOString() })
    .eq("id", countId)
    .eq("company_id", companyId);
}

export async function approveStockCount(
  supabase: SupabaseClient,
  companyId: string,
  countId: string,
  approvedBy: string,
  options?: { overrideNote?: string }
) {
  await getStockCountForCompany(supabase, companyId, countId);
  const now = new Date().toISOString();
  const note = options?.overrideNote?.trim();
  await supabase
    .from("vyron_cost_stock_counts")
    .update({
      status: "Approved",
      approved_by: approvedBy,
      approved_at: now,
      updated_at: now,
      notes: note ? `Supervisor Override: ${note}` : undefined,
    })
    .eq("id", countId)
    .eq("company_id", companyId);
}

export async function pauseStockCount(supabase: SupabaseClient, companyId: string, countId: string, actor: string) {
  await getStockCountForCompany(supabase, companyId, countId);
  const now = new Date().toISOString();
  await supabase
    .from("vyron_cost_stock_counts")
    .update({ status: "Paused", updated_at: now, notes: `Paused by ${actor} at ${now}` })
    .eq("id", countId)
    .eq("company_id", companyId);
}

export async function resumeStockCount(supabase: SupabaseClient, companyId: string, countId: string, actor: string) {
  await getStockCountForCompany(supabase, companyId, countId);
  const now = new Date().toISOString();
  await supabase
    .from("vyron_cost_stock_counts")
    .update({ status: "In Progress", updated_at: now, notes: `Resumed by ${actor} at ${now}` })
    .eq("id", countId)
    .eq("company_id", companyId);
}

export async function rejectStockCount(
  supabase: SupabaseClient,
  companyId: string,
  countId: string,
  actor: string,
  reason?: string
) {
  await getStockCountForCompany(supabase, companyId, countId);
  const now = new Date().toISOString();
  await supabase
    .from("vyron_cost_stock_counts")
    .update({
      status: "Rejected",
      approved_by: actor,
      approved_at: now,
      updated_at: now,
      notes: reason?.trim() ? `Rejected: ${reason.trim()}` : "Rejected",
    })
    .eq("id", countId)
    .eq("company_id", companyId);
}

export async function requestStockCountRecount(
  supabase: SupabaseClient,
  companyId: string,
  countId: string,
  actor: string,
  reason?: string
) {
  await getStockCountForCompany(supabase, companyId, countId);
  const now = new Date().toISOString();
  await supabase
    .from("vyron_cost_stock_counts")
    .update({
      status: "Recount Requested",
      updated_at: now,
      notes: reason?.trim() ? `Recount requested by ${actor}: ${reason.trim()}` : `Recount requested by ${actor}`,
    })
    .eq("id", countId)
    .eq("company_id", companyId);
}

export async function postStockCount(supabase: SupabaseClient, companyId: string, countId: string, actor = "supervisor") {
  const header = await getStockCountForCompany(supabase, companyId, countId);
  if (String(header.status || "") !== "Approved") {
    throw new Error("Stock count must be approved before posting.");
  }

  const { data: lines } = await supabase
    .from("vyron_cost_stock_count_lines")
    .select("*")
    .eq("stock_count_id", countId)
    .eq("company_id", companyId);
  for (const line of lines || []) {
    const variance = Number(line.variance_qty || 0);
    if (Math.abs(variance) < 0.0001) continue;
    const unitCost = Number(line.unit_cost || 0);
    if (variance > 0) {
      await postStockMovement(supabase, {
        companyId: header.company_id as string,
        stockItemId: line.stock_item_id as string,
        movementType: "Stock Count Variance",
        quantityIn: variance,
        unitCost,
        referenceType: "stock_count",
        referenceId: countId,
        referenceLabel: header.count_number as string,
        actor,
      });
    } else {
      await postStockMovement(supabase, {
        companyId: header.company_id as string,
        stockItemId: line.stock_item_id as string,
        movementType: "Stock Count Variance",
        quantityOut: Math.abs(variance),
        unitCost,
        referenceType: "stock_count",
        referenceId: countId,
        referenceLabel: header.count_number as string,
        actor,
      });
    }
  }

  await supabase
    .from("vyron_cost_stock_counts")
    .update({ status: "Posted", posted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", countId)
    .eq("company_id", companyId);

  await writeInventoryAudit(supabase, {
    companyId: header.company_id as string,
    eventType: "Stock Count Posted",
    actor,
    detail: `Posted count ${header.count_number}`,
    referenceType: "stock_count",
    referenceId: countId,
  });
}

export async function getSlowMovingItems(supabase: SupabaseClient, companyId: string, minDays: number) {
  const cutoffMs = Date.now() - minDays * 24 * 60 * 60 * 1000;
  const { data } = await supabase
    .from("vyron_cost_stock_items")
    .select("*")
    .eq("company_id", companyId)
    .gt("qty_on_hand", 0);
  return (data || [])
    .filter((item) => !item.last_movement_at || new Date(String(item.last_movement_at)).getTime() < cutoffMs)
    .map((item) => ({
    ...item,
    daysSinceMovement: item.last_movement_at
      ? Math.floor((Date.now() - new Date(item.last_movement_at as string).getTime()) / (1000 * 60 * 60 * 24))
      : 999,
  }));
}

export async function getOverstockItems(supabase: SupabaseClient, companyId: string) {
  const { data } = await supabase.from("vyron_cost_stock_items").select("*").eq("company_id", companyId).eq("stock_status", "Overstock");
  return (data || []).map((item) => {
    const qty = Number(item.qty_on_hand || 0);
    const max = Number(item.max_level || 0);
    const excess = Math.max(0, qty - max);
    return {
      ...item,
      excessQty: excess,
      excessValue: round2(excess * Number(item.average_cost || 0)),
    };
  });
}

export async function getInventoryExecutiveStats(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const dash = await getInventoryDashboardStats(supabase, companyId);
  return {
    inventoryValue: dash.totalInventoryValue,
    lowStock: dash.lowStockItems,
    slowMoving: dash.slowMovingItems,
    inventoryVariance: dash.inventoryVarianceValue,
    stockTurnover: dash.stockTurnover,
    rawMaterialValue: dash.rawMaterialValue,
    finishedGoodsValue: dash.finishedGoodsValue,
    negativeStockRisks: dash.negativeStockRisks,
  };
}

export async function createReplenishmentPoFromAlert(
  supabase: SupabaseClient,
  companyId: string,
  alertId: string,
  actor = "user"
) {
  const { data: alert, error } = await supabase
    .from("vyron_cost_low_stock_alerts")
    .select("*, vyron_cost_stock_items(*)")
    .eq("id", alertId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error || !alert) throw new Error("Low stock alert not found.");

  const stockItem = alert.vyron_cost_stock_items as StockItemRow | null;
  if (!stockItem) throw new Error("Stock item not found for alert.");

  const qty = Math.max(Number(alert.required_qty || 0), Number(stockItem.reorder_level || 0));
  const unitCost = Number(stockItem.average_cost || stockItem.current_cost || 0);
  const { savePurchaseOrder } = await import("@/lib/vyron-procurement");
  const poNumber = `PO-REPL-${Date.now().toString().slice(-6)}`;

  const po = await savePurchaseOrder(
    supabase,
    companyId,
    {
      po_number: poNumber,
      supplier_id: stockItem.supplier_id,
      supplier_name_snapshot: String(alert.preferred_supplier_name || stockItem.supplier_name_snapshot || "Preferred Supplier"),
      status: "Draft",
      notes: `Auto-suggested from low stock alert for ${stockItem.description}. Last cost ${unitCost}.`,
      lines: [
        {
          item_type: stockItem.entity_type === "packaging" ? "packaging" : "ingredient",
          item_id: stockItem.entity_id,
          item_name: stockItem.description,
          quantity: qty,
          unit: stockItem.unit || "kg",
          unit_price: unitCost,
          vat_rate: 15,
        },
      ],
    },
    actor
  );

  if (!po) throw new Error("Purchase order could not be created.");

  await writeInventoryAudit(supabase, {
    companyId,
    stockItemId: stockItem.id,
    eventType: "Replenishment PO Created",
    actor,
    detail: `Created ${poNumber} for ${qty} units of ${stockItem.description}`,
    referenceType: "purchase_order",
    referenceId: po.id,
  });

  return po;
}
