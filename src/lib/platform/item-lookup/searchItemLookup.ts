import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemLookupResult, ItemLookupSearchParams } from "@/lib/platform/item-lookup/ItemLookupTypes";
import { findOrCreateStockItem } from "@/lib/vyron-inventory";

/*
 * A picker that silently stops at 20 rows tells the operator their ingredient
 * does not exist. The default now covers a normal master list outright, and the
 * ceiling is high enough that a company's whole catalogue can be requested; the
 * caller is told the true match count either way, so truncation is never silent.
 */
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

type StockItemRow = {
  id: string;
  item_code: string;
  description: string;
  category: string | null;
  entity_type: string;
  entity_id: string | null;
  unit: string;
  supplier_id: string | null;
  supplier_name_snapshot: string | null;
  current_cost: number | null;
  qty_on_hand: number | null;
  stock_status: string | null;
  barcode: string | null;
  supplier_item_code: string | null;
  customer_item_code: string | null;
  aliases: string[] | null;
  is_active: boolean | null;
  default_warehouse: string | null;
};

type ProductFinancialRow = {
  id: string;
  product_name: string;
  category: string | null;
  product_category: string | null;
  total_cost: number | null;
  product_status: string | null;
  financial_sales_account_id: string | null;
  financial_cost_of_sales_account_id: string | null;
  financial_inventory_asset_account_id: string | null;
};

type IngredientMasterRow = {
  id: string;
  ingredient_name: string;
  category: string | null;
  purchase_unit: string | null;
  purchase_cost: number | null;
  supplier_id: string | null;
};

function escapeIlike(value: string) {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

function classifyIngredientEntityType(category: string | null): "ingredient" | "packaging" {
  return String(category || "").toLowerCase().includes("pack") ? "packaging" : "ingredient";
}

function masterItemCode(prefix: string, id: string) {
  return `${prefix}-${id.slice(0, 8).toUpperCase()}`;
}

function matchesQuery(q: string | undefined, ...fields: Array<string | null | undefined>) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((field) => String(field || "").toLowerCase().includes(needle));
}

function buildResultFromStockRow(
  row: StockItemRow,
  financialByProductId: Map<string, ProductFinancialRow>
): ItemLookupResult {
  const financial = row.entity_id ? financialByProductId.get(row.entity_id) : undefined;
  return {
    id: row.id,
    stockItemId: row.id,
    entityType: (row.entity_type as ItemLookupResult["entityType"]) || "finished_goods",
    entityId: row.entity_id,
    itemCode: row.item_code,
    productName: row.description,
    description: row.description,
    category: row.category,
    unit: row.unit,
    barcode: row.barcode,
    supplierItemCode: row.supplier_item_code,
    customerItemCode: row.customer_item_code,
    aliases: row.aliases || [],
    isActive: row.is_active ?? true,
    currentCost: Number(row.current_cost || 0),
    qtyOnHand: Number(row.qty_on_hand || 0),
    stockStatus: row.stock_status,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name_snapshot,
    defaultWarehouse: row.default_warehouse,
    vatRate: null,
    financialSalesAccountId: financial?.financial_sales_account_id || null,
    financialCostOfSalesAccountId: financial?.financial_cost_of_sales_account_id || null,
    financialInventoryAssetAccountId: financial?.financial_inventory_asset_account_id || null,
  };
}

type PendingEntry =
  | { kind: "resolved"; description: string; result: ItemLookupResult }
  | { kind: "ingredient"; description: string; row: IngredientMasterRow; entityType: "ingredient" | "packaging" }
  | { kind: "product"; description: string; row: ProductFinancialRow };

/**
 * The document item lookup (Purchase Orders, Sales Orders, Customer Invoices, Stock Movements,
 * BOM/Recipes) must expose the full authoritative product catalogue for the company —
 * every ingredient, packaging item, and finished good in Master Data — not just the subset
 * that already has a `vyron_cost_stock_items` row. Stock items are created lazily the first
 * time a purchase/receipt/production/sale actually happens against an entity, so a brand-new
 * Master Data record has no stock item yet even though it is a perfectly valid product.
 * This function treats `vyron_cost_ingredients` and `vyron_cost_products` as the source of
 * truth for *existence*, and layers stock data on top where it already exists, materializing
 * a real stock item (via the same lazy-create path GRNs/production/invoices already use) only
 * for the bounded page of results actually being returned.
 */
/**
 * A master record presented as a lookup result, with no stock item behind it.
 *
 * `stockItemId` is empty because none exists, and `needsStockItem` says so, so
 * a caller that requires one can create it deliberately instead of a search
 * doing it as a side effect. Selecting the item for a BOM, purchase order,
 * invoice or sales order uses `entityId` and is unaffected.
 */
function buildResultFromMaster(
  entry: PendingEntry,
  financialByProductId: Map<string, ProductFinancialRow>
): ItemLookupResult {
  if (entry.kind === "resolved") return entry.result;

  if (entry.kind === "ingredient") {
    const row = entry.row;
    return {
      id: `master:${row.id}`,
      stockItemId: "",
      needsStockItem: true,
      entityType: entry.entityType,
      entityId: String(row.id),
      itemCode: masterItemCode("ING", String(row.id)),
      productName: row.ingredient_name,
      description: row.ingredient_name,
      category: row.category || null,
      unit: row.purchase_unit || "kg",
      barcode: null,
      supplierItemCode: null,
      customerItemCode: null,
      aliases: [],
      isActive: true,
      currentCost: Number(row.purchase_cost || 0),
      qtyOnHand: 0,
      stockStatus: null,
      supplierId: row.supplier_id || null,
      supplierName: null,
      defaultWarehouse: null,
      vatRate: null,
      financialSalesAccountId: null,
      financialCostOfSalesAccountId: null,
      financialInventoryAssetAccountId: null,
    };
  }

  const row = entry.row;
  const financial = financialByProductId.get(row.id);
  return {
    id: `master:${row.id}`,
    stockItemId: "",
    needsStockItem: true,
    entityType: "finished_goods",
    entityId: String(row.id),
    itemCode: masterItemCode("FG", String(row.id)),
    productName: row.product_name,
    description: row.product_name,
    category: row.product_category || row.category || null,
    unit: "unit",
    barcode: null,
    supplierItemCode: null,
    customerItemCode: null,
    aliases: [],
    isActive: row.product_status !== "Archived",
    currentCost: Number(row.total_cost || 0),
    qtyOnHand: 0,
    stockStatus: null,
    supplierId: null,
    supplierName: null,
    defaultWarehouse: null,
    vatRate: null,
    financialSalesAccountId: financial?.financial_sales_account_id || null,
    financialCostOfSalesAccountId: financial?.financial_cost_of_sales_account_id || null,
    financialInventoryAssetAccountId: financial?.financial_inventory_asset_account_id || null,
  };
}

export async function searchItemLookup(
  supabase: SupabaseClient,
  companyId: string,
  params: ItemLookupSearchParams
): Promise<ItemLookupResult[]> {
  return (await searchItemLookupPage(supabase, companyId, params)).items;
}

/**
 * The same search, also reporting how many items matched before the page was
 * cut. The caller needs the total to tell the operator that more exist.
 *
 * Searching is read-only. It used to create a stock item for every master
 * record it returned, so merely opening a picker wrote rows into the company's
 * inventory. Nothing about selecting an ingredient for a BOM needs one: the BOM
 * line stores the ingredient's own master id. A caller that genuinely needs a
 * stock item — posting a stock movement — asks for one with `materialise`, so
 * creation happens when an item is committed to a transaction rather than when
 * somebody types into a search box.
 */
export async function searchItemLookupPage(
  supabase: SupabaseClient,
  companyId: string,
  params: ItemLookupSearchParams & { materialise?: boolean }
): Promise<{ items: ItemLookupResult[]; total: number }> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.limit) || DEFAULT_LIMIT));
  const q = params.q?.trim();
  const filtersByEntityType =
    Boolean(params.type) && params.type !== "all" && params.type !== "consumables" && params.type !== "services";

  let stockQuery = supabase
    .from("vyron_cost_stock_items")
    .select(
      "id,item_code,description,category,entity_type,entity_id,unit,supplier_id,supplier_name_snapshot,current_cost,qty_on_hand,stock_status,barcode,supplier_item_code,customer_item_code,aliases,is_active,default_warehouse"
    )
    .eq("company_id", companyId);

  if (filtersByEntityType) stockQuery = stockQuery.eq("entity_type", params.type as string);
  if (params.status === "active") stockQuery = stockQuery.eq("is_active", true);
  if (params.status === "inactive") stockQuery = stockQuery.eq("is_active", false);
  if (params.category) stockQuery = stockQuery.eq("category", params.category);
  if (params.supplierId) stockQuery = stockQuery.eq("supplier_id", params.supplierId);

  if (q) {
    const escaped = escapeIlike(q);
    stockQuery = stockQuery.or(
      [
        `item_code.ilike.%${escaped}%`,
        `description.ilike.%${escaped}%`,
        `barcode.ilike.%${escaped}%`,
        `supplier_item_code.ilike.%${escaped}%`,
        `customer_item_code.ilike.%${escaped}%`,
      ].join(",")
    );
  }

  const [
    { data: stockData, error: stockError },
    { data: coveredRows, error: coveredError },
    { data: ingredientRows, error: ingredientError },
    { data: productRows, error: productError },
  ] = await Promise.all([
    stockQuery.order("description"),
    supabase.from("vyron_cost_stock_items").select("entity_id").eq("company_id", companyId).not("entity_id", "is", null),
    supabase
      .from("vyron_cost_ingredients")
      .select("id,ingredient_name,category,purchase_unit,purchase_cost,supplier_id")
      .eq("company_id", companyId),
    supabase
      .from("vyron_cost_products")
      .select(
        "id,product_name,category,product_category,total_cost,product_status,financial_sales_account_id,financial_cost_of_sales_account_id,financial_inventory_asset_account_id"
      )
      .eq("company_id", companyId),
  ]);

  if (stockError) throw new Error(stockError.message);
  if (coveredError) throw new Error(coveredError.message);
  if (ingredientError) throw new Error(ingredientError.message);
  if (productError) throw new Error(productError.message);

  const stockRows = (stockData || []) as StockItemRow[];
  const ingredients = (ingredientRows || []) as IngredientMasterRow[];
  const products = (productRows || []) as ProductFinancialRow[];

  const coveredEntityIds = new Set((coveredRows || []).map((row) => String((row as { entity_id: string }).entity_id)));

  const financialByProductId = new Map<string, ProductFinancialRow>();
  for (const row of products) financialByProductId.set(row.id, row);

  const pending: PendingEntry[] = stockRows.map((row) => ({
    kind: "resolved",
    description: row.description,
    result: buildResultFromStockRow(row, financialByProductId),
  }));

  const includeIngredientLike = !filtersByEntityType || params.type === "ingredient" || params.type === "packaging";
  const includeFinishedGoods = !filtersByEntityType || params.type === "finished_goods";

  if (includeIngredientLike) {
    for (const ing of ingredients) {
      if (coveredEntityIds.has(String(ing.id))) continue;
      const entityType = classifyIngredientEntityType(ing.category);
      if (filtersByEntityType && params.type !== entityType) continue;
      if (params.status === "inactive") continue;
      if (params.category && String(ing.category || "") !== params.category) continue;
      if (params.supplierId && String(ing.supplier_id || "") !== params.supplierId) continue;
      const itemCode = masterItemCode("ING", String(ing.id));
      if (!matchesQuery(q, itemCode, ing.ingredient_name, ing.category)) continue;

      pending.push({ kind: "ingredient", description: ing.ingredient_name, row: ing, entityType });
    }
  }

  if (includeFinishedGoods) {
    for (const prod of products) {
      if (coveredEntityIds.has(String(prod.id))) continue;
      const isActive = prod.product_status !== "Archived";
      if (params.status === "active" && !isActive) continue;
      if (params.status === "inactive" && isActive) continue;
      const category = prod.product_category || prod.category || null;
      if (params.category && String(category || "") !== params.category) continue;
      if (params.supplierId) continue;
      const itemCode = masterItemCode("FG", String(prod.id));
      if (!matchesQuery(q, itemCode, prod.product_name, category)) continue;

      pending.push({ kind: "product", description: prod.product_name, row: prod });
    }
  }

  pending.sort((a, b) => a.description.localeCompare(b.description));
  const total = pending.length;
  const page = pending.slice(0, limit);

  const results = await Promise.all(
    page.map(async (entry): Promise<ItemLookupResult> => {
      if (entry.kind === "resolved") return entry.result;

      // Read-only unless the caller asked for a real stock item.
      if (!params.materialise) return buildResultFromMaster(entry, financialByProductId);

      if (entry.kind === "ingredient") {
        const created = await findOrCreateStockItem(supabase, companyId, {
          entityType: entry.entityType,
          entityId: String(entry.row.id),
          itemCode: masterItemCode("ING", String(entry.row.id)),
          description: entry.row.ingredient_name,
          category: entry.row.category || "Uncategorised",
          unit: entry.row.purchase_unit || "kg",
          supplierId: entry.row.supplier_id || null,
          currentCost: Number(entry.row.purchase_cost || 0),
          reorderLevel: 20,
          minLevel: 10,
          maxLevel: 200,
        });
        return buildResultFromStockRow(created as unknown as StockItemRow, financialByProductId);
      }

      const created = await findOrCreateStockItem(supabase, companyId, {
        entityType: "finished_goods",
        entityId: String(entry.row.id),
        itemCode: masterItemCode("FG", String(entry.row.id)),
        description: entry.row.product_name,
        category: entry.row.product_category || entry.row.category || "Finished Goods",
        unit: "unit",
        currentCost: Number(entry.row.total_cost || 0),
        reorderLevel: 50,
        minLevel: 20,
        maxLevel: 1000,
      });
      return buildResultFromStockRow(created as unknown as StockItemRow, financialByProductId);
    })
  );

  return { items: results, total };
}
