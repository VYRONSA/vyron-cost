import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemLookupResult, ItemLookupSearchParams } from "@/lib/platform/item-lookup/ItemLookupTypes";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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
  financial_sales_account_id: string | null;
  financial_cost_of_sales_account_id: string | null;
  financial_inventory_asset_account_id: string | null;
};

function escapeIlike(value: string) {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

export async function searchItemLookup(
  supabase: SupabaseClient,
  companyId: string,
  params: ItemLookupSearchParams
): Promise<ItemLookupResult[]> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.limit) || DEFAULT_LIMIT));

  let query = supabase
    .from("vyron_cost_stock_items")
    .select(
      "id,item_code,description,category,entity_type,entity_id,unit,supplier_id,supplier_name_snapshot,current_cost,qty_on_hand,stock_status,barcode,supplier_item_code,customer_item_code,aliases,is_active,default_warehouse"
    )
    .eq("company_id", companyId);

  if (params.type && params.type !== "all" && params.type !== "consumables" && params.type !== "services") {
    query = query.eq("entity_type", params.type);
  }

  if (params.status === "active") query = query.eq("is_active", true);
  if (params.status === "inactive") query = query.eq("is_active", false);
  if (params.category) query = query.eq("category", params.category);
  if (params.supplierId) query = query.eq("supplier_id", params.supplierId);

  const q = params.q?.trim();
  if (q) {
    const escaped = escapeIlike(q);
    query = query.or(
      [
        `item_code.ilike.%${escaped}%`,
        `description.ilike.%${escaped}%`,
        `barcode.ilike.%${escaped}%`,
        `supplier_item_code.ilike.%${escaped}%`,
        `customer_item_code.ilike.%${escaped}%`,
        `aliases::text.ilike.%${escaped}%`,
      ].join(",")
    );
  }

  const { data, error } = await query.order("description").limit(limit);
  if (error) throw new Error(error.message);

  const rows = (data || []) as StockItemRow[];

  const finishedGoodProductIds = rows
    .filter((row) => row.entity_type === "finished_goods" && row.entity_id)
    .map((row) => row.entity_id as string);

  const financialByProductId = new Map<string, ProductFinancialRow>();
  if (finishedGoodProductIds.length) {
    const { data: productRows } = await supabase
      .from("vyron_cost_products")
      .select("id,financial_sales_account_id,financial_cost_of_sales_account_id,financial_inventory_asset_account_id")
      .eq("company_id", companyId)
      .in("id", finishedGoodProductIds);
    for (const row of (productRows || []) as ProductFinancialRow[]) {
      financialByProductId.set(row.id, row);
    }
  }

  return rows
    .map((row): ItemLookupResult => {
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
    });
}
