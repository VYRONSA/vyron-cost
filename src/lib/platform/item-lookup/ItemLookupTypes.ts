// Must match StockEntityType in src/lib/vyron-inventory.ts — that module owns the
// vyron_cost_stock_items.entity_type column and writes "ingredient" (singular).
export type ItemLookupEntityType = "ingredient" | "packaging" | "finished_goods";

export type ItemLookupItemType = ItemLookupEntityType | "consumables" | "services";

export type ItemLookupResult = {
  id: string;
  stockItemId: string;
  /** True when this came from master data and has no stock item yet. */
  needsStockItem?: boolean;
  entityType: ItemLookupEntityType;
  entityId: string | null;
  itemCode: string;
  productName: string;
  description: string | null;
  category: string | null;
  unit: string;
  barcode: string | null;
  supplierItemCode: string | null;
  customerItemCode: string | null;
  aliases: string[];
  isActive: boolean;
  currentCost: number;
  qtyOnHand: number;
  stockStatus: string | null;
  supplierId: string | null;
  supplierName: string | null;
  defaultWarehouse: string | null;
  vatRate: number | null;
  financialSalesAccountId: string | null;
  financialCostOfSalesAccountId: string | null;
  financialInventoryAssetAccountId: string | null;
};

export type ItemLookupSearchParams = {
  q?: string;
  type?: ItemLookupItemType | "all";
  status?: "active" | "inactive" | "all";
  category?: string;
  supplierId?: string;
  limit?: number;
};

/**
 * Why a lookup returned what it did.
 *
 * An empty list used to mean four different things at once — nobody signed in,
 * no permission, no workspace resolved, or simply nothing matching the search.
 * The picker could only render "No items found." for all of them, so a broken
 * session was indistinguishable from an unusual search term. The reason is
 * carried so the caller can say which one happened.
 */
export type ItemLookupSearchReason =
  | "ok"
  | "empty"
  | "no_workspace"
  | "unauthenticated"
  | "unauthorized"
  | "error";

export type ItemLookupSearchResponse = {
  ok: boolean;
  items: ItemLookupResult[];
  /** Matches before the page limit, so truncation can be shown rather than hidden. */
  total?: number;
  reason?: ItemLookupSearchReason;
  error?: string;
};
