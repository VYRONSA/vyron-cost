export type StockMovementType =
  | "GRN_RECEIPT"
  | "MANUFACTURING_CONSUMPTION"
  | "MANUFACTURING_OUTPUT"
  | "CUSTOMER_INVOICE"
  | "STOCK_COUNT"
  | "DAMAGE"
  | "REJECTION"
  | "ADJUSTMENT";

export type StockItemType = "ingredient" | "packaging" | "finished_good";

export type StockMovement = {
  id: string;
  movement_date: string;
  movement_type: StockMovementType;
  item_type: StockItemType;
  item_id: string;
  item_name: string;
  reference_type: string;
  reference_id?: string | null;
  reference_number: string;
  quantity_in: number;
  quantity_out: number;
  unit_cost: number;
  total_value: number;
  location_name?: string | null;
  notes?: string | null;
};

export type FinishedGoodSummary = {
  id: string;
  product_name: string;
  sku: string;
  current_stock: number;
  average_unit_cost: number;
  stock_value: number;
  last_manufactured_at: string;
  sales_velocity_30_days: number;
  days_cover: number;
  status: "Healthy" | "Low Stock" | "Overstocked" | "Watch";
};

export const demoStockMovements: StockMovement[] = [
  {
    id: "sm-001",
    movement_date: "2026-06-01",
    movement_type: "GRN_RECEIPT",
    item_type: "ingredient",
    item_id: "beef",
    item_name: "Beef",
    reference_type: "GRN",
    reference_id: "grn-1001",
    reference_number: "GRN-1001",
    quantity_in: 250,
    quantity_out: 0,
    unit_cost: 92.5,
    total_value: 23125,
    location_name: "Main Factory",
    notes: "Received against PO-1041",
  },
  {
    id: "sm-002",
    movement_date: "2026-06-02",
    movement_type: "MANUFACTURING_CONSUMPTION",
    item_type: "ingredient",
    item_id: "beef",
    item_name: "Beef",
    reference_type: "Manufacturing Batch",
    reference_id: "mb-0001",
    reference_number: "MB-0001",
    quantity_in: 0,
    quantity_out: 68,
    unit_cost: 92.5,
    total_value: 6290,
    location_name: "Main Factory",
    notes: "Consumed for Beef Pie batch",
  },
  {
    id: "sm-003",
    movement_date: "2026-06-02",
    movement_type: "MANUFACTURING_OUTPUT",
    item_type: "finished_good",
    item_id: "fg-beef-pie",
    item_name: "Beef Pie",
    reference_type: "Manufacturing Batch",
    reference_id: "mb-0001",
    reference_number: "MB-0001",
    quantity_in: 1200,
    quantity_out: 0,
    unit_cost: 14.2,
    total_value: 17040,
    location_name: "Finished Goods Store",
    notes: "Completed manufacturing output",
  },
  {
    id: "sm-004",
    movement_date: "2026-06-03",
    movement_type: "CUSTOMER_INVOICE",
    item_type: "finished_good",
    item_id: "fg-beef-pie",
    item_name: "Beef Pie",
    reference_type: "Customer Invoice",
    reference_id: "ci-0001",
    reference_number: "CI-0001",
    quantity_in: 0,
    quantity_out: 200,
    unit_cost: 14.2,
    total_value: 2840,
    location_name: "Finished Goods Store",
    notes: "Sold to Local Café Group",
  },
];

export const demoFinishedGoods: FinishedGoodSummary[] = [
  {
    id: "fg-beef-pie",
    product_name: "Beef Pie",
    sku: "PIE-BEEF-001",
    current_stock: 1000,
    average_unit_cost: 14.2,
    stock_value: 14200,
    last_manufactured_at: "2026-06-02",
    sales_velocity_30_days: 85,
    days_cover: 12,
    status: "Healthy",
  },
  {
    id: "fg-chicken-pie",
    product_name: "Chicken Pie",
    sku: "PIE-CHICK-001",
    current_stock: 820,
    average_unit_cost: 13.1,
    stock_value: 10742,
    last_manufactured_at: "2026-06-03",
    sales_velocity_30_days: 92,
    days_cover: 9,
    status: "Watch",
  },
  {
    id: "fg-mutton-pie",
    product_name: "Mutton Pie",
    sku: "PIE-MUTTON-001",
    current_stock: 390,
    average_unit_cost: 16.85,
    stock_value: 6571.5,
    last_manufactured_at: "2026-05-31",
    sales_velocity_30_days: 61,
    days_cover: 6,
    status: "Low Stock",
  },
  {
    id: "fg-cheese-pie",
    product_name: "Cheese Pie",
    sku: "PIE-CHEESE-001",
    current_stock: 1440,
    average_unit_cost: 11.95,
    stock_value: 17208,
    last_manufactured_at: "2026-06-01",
    sales_velocity_30_days: 44,
    days_cover: 33,
    status: "Overstocked",
  },
];

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-ZA", { maximumFractionDigits }).format(value);
}

export function calculateStockOnHand(movements: StockMovement[], itemId: string) {
  return movements
    .filter((movement) => movement.item_id === itemId)
    .reduce((total, movement) => total + movement.quantity_in - movement.quantity_out, 0);
}

export function calculateStockValue(movements: StockMovement[], itemId: string) {
  return movements
    .filter((movement) => movement.item_id === itemId)
    .reduce((total, movement) => {
      if (movement.quantity_in > 0) return total + movement.total_value;
      if (movement.quantity_out > 0) return total - movement.total_value;
      return total;
    }, 0);
}

let movementCounter = 0;

const movementTypeMap: Record<string, StockMovementType> = {
  "GRN Receipt": "GRN_RECEIPT",
  "Manufacturing Consumption": "MANUFACTURING_CONSUMPTION",
  "Manufacturing Output": "MANUFACTURING_OUTPUT",
  "Customer Invoice / Sale": "CUSTOMER_INVOICE",
};

export function buildStockMovement(params: {
  date: string;
  itemType: "raw_material" | "packaging" | "finished_good" | "ingredient";
  itemId: string;
  itemName: string;
  movementType: string;
  reference: string;
  quantityIn: number;
  quantityOut: number;
  unitCost: number;
  locationName?: string;
  notes?: string;
}): StockMovement {
  movementCounter += 1;
  const qty = params.quantityIn > 0 ? params.quantityIn : params.quantityOut;
  const itemType = params.itemType === "raw_material" ? "ingredient" : params.itemType;
  return {
    id: `sm-${movementCounter}`,
    movement_date: params.date,
    movement_type: movementTypeMap[params.movementType] ?? "ADJUSTMENT",
    item_type: itemType,
    item_id: params.itemId,
    item_name: params.itemName,
    reference_type: params.movementType,
    reference_number: params.reference,
    quantity_in: params.quantityIn,
    quantity_out: params.quantityOut,
    unit_cost: params.unitCost,
    total_value: qty * params.unitCost,
    location_name: params.locationName ?? null,
    notes: params.notes ?? null,
  };
}

export type StockBalance = {
  itemId: string;
  itemName: string;
  itemType: StockItemType;
  quantityOnHand: number;
  unitCost: number;
  totalValue: number;
  lastMovementDate: string;
};

export function calculateBalances(movements: StockMovement[]): StockBalance[] {
  const byItem = new Map<string, StockBalance>();
  for (const movement of movements) {
    const existing = byItem.get(movement.item_id) ?? {
      itemId: movement.item_id,
      itemName: movement.item_name,
      itemType: movement.item_type,
      quantityOnHand: 0,
      unitCost: movement.unit_cost,
      totalValue: 0,
      lastMovementDate: movement.movement_date,
    };
    existing.quantityOnHand += movement.quantity_in - movement.quantity_out;
    if (movement.quantity_in > 0) existing.totalValue += movement.total_value;
    else if (movement.quantity_out > 0) existing.totalValue -= movement.total_value;
    if (movement.quantity_in > 0) existing.unitCost = movement.unit_cost;
    if (movement.movement_date >= existing.lastMovementDate) existing.lastMovementDate = movement.movement_date;
    byItem.set(movement.item_id, existing);
  }
  return [...byItem.values()];
}
