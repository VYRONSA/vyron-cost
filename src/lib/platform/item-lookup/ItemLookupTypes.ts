// Must match StockEntityType in src/lib/vyron-inventory.ts — that module owns the
// vyron_cost_stock_items.entity_type column and writes "ingredient" (singular).
export type ItemLookupEntityType = "ingredient" | "packaging" | "finished_goods";

export type ItemLookupItemType = ItemLookupEntityType | "consumables" | "services";

export type ItemLookupResult = {
  id: string;
  stockItemId: string;
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

export type ItemLookupSearchResponse = {
  ok: boolean;
  items: ItemLookupResult[];
  error?: string;
};
