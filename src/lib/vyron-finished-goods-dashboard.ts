/**
 * Finished Goods dashboard — pure aggregation over existing records.
 *
 * Inputs are the company's finished-goods stock items (vyron_cost_stock_items,
 * entity_type = 'finished_goods'), their stock ledger rows up to the end of the
 * selected range, and production runs in the range. Nothing here creates or
 * estimates stock: opening and closing balances are the ledger's own
 * balance_after figures, and an item with no ledger history reports its
 * opening/closing as null ("no ledger history") instead of a guess.
 */

export type FgStockItemInput = {
  id: string;
  itemCode: string;
  description: string;
  category: string;
  unit: string;
  qtyOnHand: number;
  averageCost: number;
  inventoryValue: number | null;
  minLevel: number;
  stockStatus: string;
  isActive: boolean;
  lastMovementAt: string | null;
};

export type FgLedgerInput = {
  id: string;
  stockItemId: string;
  movementDate: string;
  movementType: string;
  quantityIn: number;
  quantityOut: number;
  balanceAfter: number;
  unitCost: number;
  value: number;
  referenceType: string | null;
  referenceId: string | null;
  referenceLabel: string | null;
  actor: string | null;
  createdAt: string | null;
};

export type FgProductionRunInput = {
  id: string;
  runNumber: string;
  productId: string | null;
  productName: string;
  status: string;
  plannedQty: number;
  actualQty: number;
  date: string;
};

export type MovementCategory = "production" | "sales" | "adjustment" | "opening" | "other";

export function movementCategory(type: string, referenceType?: string | null): MovementCategory {
  const t = `${type || ""} ${referenceType || ""}`.toLowerCase();
  if (/opening/.test(t)) return "opening";
  if (/production|manufactur/.test(t)) return "production";
  if (/sale|invoice|dispatch|store.?order|delivery/.test(t)) return "sales";
  if (/count|stock.?take|adjust|correction|variance|waste|write.?off/.test(t)) return "adjustment";
  return "other";
}

export type FgRow = {
  id: string;
  itemCode: string;
  description: string;
  category: string;
  unit: string;
  isActive: boolean;
  qtyOnHand: number;
  averageCost: number;
  stockValue: number;
  minLevel: number;
  belowMinimum: boolean;
  stockStatus: string;
  openingQty: number | null;
  closingQty: number | null;
  producedQty: number;
  soldQty: number;
  adjustmentInQty: number;
  adjustmentOutQty: number;
  otherInQty: number;
  otherOutQty: number;
  totalInQty: number;
  totalOutQty: number;
  movementCount: number;
  lastMovementAt: string | null;
};

export type FgDashboard = {
  from: string;
  to: string;
  rows: FgRow[];
  totals: {
    items: number;
    activeItems: number;
    qtyOnHand: number;
    stockValue: number;
    belowMinimum: number;
    outOfStock: number;
    negative: number;
    producedQty: number;
    soldQty: number;
    movementCount: number;
    itemsWithoutLedger: number;
  };
  production: {
    runs: number;
    completedRuns: number;
    plannedQty: number;
    actualQty: number;
    byStatus: Record<string, number>;
  };
};

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (iso: string) => String(iso || "").slice(0, 10);

/** Ledger order: movement date, then created_at, then id — the posting order. */
export function ledgerOrder(a: FgLedgerInput, b: FgLedgerInput) {
  if (a.movementDate !== b.movementDate) return a.movementDate < b.movementDate ? -1 : 1;
  const ac = a.createdAt || "";
  const bc = b.createdAt || "";
  if (ac !== bc) return ac < bc ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildFinishedGoodsDashboard(input: {
  from: string;
  to: string;
  items: FgStockItemInput[];
  /** Every ledger row for these items with movement_date <= `to` (end of day). */
  ledger: FgLedgerInput[];
  runs: FgProductionRunInput[];
}): FgDashboard {
  const { from, to } = input;
  const byItem = new Map<string, FgLedgerInput[]>();
  for (const l of input.ledger) {
    const list = byItem.get(l.stockItemId) || [];
    list.push(l);
    byItem.set(l.stockItemId, list);
  }

  const rows: FgRow[] = input.items.map((item) => {
    const all = (byItem.get(item.id) || []).filter((l) => day(l.movementDate) <= to).sort(ledgerOrder);
    const before = all.filter((l) => day(l.movementDate) < from);
    const within = all.filter((l) => day(l.movementDate) >= from);
    const hasHistory = all.length > 0;
    const openingQty = before.length ? before[before.length - 1].balanceAfter : hasHistory ? 0 : null;
    const closingQty = all.length ? all[all.length - 1].balanceAfter : null;

    let producedQty = 0, soldQty = 0, adjIn = 0, adjOut = 0, otherIn = 0, otherOut = 0, tin = 0, tout = 0;
    for (const l of within) {
      const cat = movementCategory(l.movementType, l.referenceType);
      tin += l.quantityIn;
      tout += l.quantityOut;
      if (cat === "production") producedQty += l.quantityIn - l.quantityOut;
      else if (cat === "sales") soldQty += l.quantityOut - l.quantityIn;
      else if (cat === "adjustment") { adjIn += l.quantityIn; adjOut += l.quantityOut; }
      else { otherIn += l.quantityIn; otherOut += l.quantityOut; }
    }
    const stockValue = item.inventoryValue !== null ? item.inventoryValue : r2(item.qtyOnHand * item.averageCost);
    return {
      id: item.id,
      itemCode: item.itemCode,
      description: item.description,
      category: item.category,
      unit: item.unit,
      isActive: item.isActive,
      qtyOnHand: item.qtyOnHand,
      averageCost: item.averageCost,
      stockValue,
      minLevel: item.minLevel,
      belowMinimum: item.minLevel > 0 && item.qtyOnHand < item.minLevel,
      stockStatus: item.stockStatus,
      openingQty: openingQty === null ? null : r4(openingQty),
      closingQty: closingQty === null ? null : r4(closingQty),
      producedQty: r4(producedQty),
      soldQty: r4(soldQty),
      adjustmentInQty: r4(adjIn),
      adjustmentOutQty: r4(adjOut),
      otherInQty: r4(otherIn),
      otherOutQty: r4(otherOut),
      totalInQty: r4(tin),
      totalOutQty: r4(tout),
      movementCount: within.length,
      lastMovementAt: item.lastMovementAt,
    };
  });

  const byStatus: Record<string, number> = {};
  let plannedQty = 0, actualQty = 0, completedRuns = 0;
  for (const run of input.runs) {
    byStatus[run.status] = (byStatus[run.status] || 0) + 1;
    plannedQty += run.plannedQty;
    if (/complete/i.test(run.status)) { completedRuns += 1; actualQty += run.actualQty; }
  }

  return {
    from,
    to,
    rows,
    totals: {
      items: rows.length,
      activeItems: rows.filter((r) => r.isActive).length,
      qtyOnHand: r4(rows.reduce((s, r) => s + r.qtyOnHand, 0)),
      stockValue: r2(rows.reduce((s, r) => s + r.stockValue, 0)),
      belowMinimum: rows.filter((r) => r.belowMinimum).length,
      outOfStock: rows.filter((r) => r.qtyOnHand === 0).length,
      negative: rows.filter((r) => r.qtyOnHand < 0).length,
      producedQty: r4(rows.reduce((s, r) => s + r.producedQty, 0)),
      soldQty: r4(rows.reduce((s, r) => s + r.soldQty, 0)),
      movementCount: rows.reduce((s, r) => s + r.movementCount, 0),
      itemsWithoutLedger: rows.filter((r) => r.closingQty === null).length,
    },
    production: {
      runs: input.runs.length,
      completedRuns,
      plannedQty: r4(plannedQty),
      actualQty: r4(actualQty),
      byStatus,
    },
  };
}
