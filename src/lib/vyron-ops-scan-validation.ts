import type { SupabaseClient } from "@supabase/supabase-js";
import { getPurchaseOrderEngineDetail } from "@/lib/vyron-purchase-order-engine";
import { listStockItemsForMovements } from "@/lib/vyron-inventory-transactions";
import { getStoreOrderDetail } from "@/lib/vyron-store-orders";
import { getStoreProductionRunDetail } from "@/lib/vyron-store-production-planning";

export const OPS_SCAN_WORKFLOWS = [
  "receiving",
  "production",
  "picking",
  "dispatch",
  "inventory_count",
  "inventory_lookup",
  "inventory_transfer",
] as const;

export type OpsScanWorkflow = (typeof OPS_SCAN_WORKFLOWS)[number];

export type OpsScanContext = {
  purchaseOrderId?: string;
  lineId?: string;
  storeOrderId?: string;
  productionRunId?: string;
  stockItemId?: string;
  expectedLabel?: string;
  transferStep?: "source" | "destination";
  warehouseId?: string;
  locationId?: string;
};

export type OpsScanMatchedItem = {
  stockItemId: string;
  itemCode: string;
  description: string;
  qtyOnHand: number;
  unit: string;
  entityType: string;
};

export type OpsScanValidationResult = {
  valid: boolean;
  status: "success" | "wrong_item" | "unknown" | "duplicate" | "not_found";
  barcode: string;
  workflow: OpsScanWorkflow;
  matched?: OpsScanMatchedItem;
  expected?: { label: string; itemCode?: string };
  actual?: { label: string; itemCode?: string };
  recommendation: string;
  action: string;
  lineId?: string;
  routeHint?: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchesBarcode(candidate: string, barcode: string) {
  const a = normalize(candidate);
  const b = normalize(barcode);
  return a === b || a.includes(b) || b.includes(a);
}

function toMatched(row: Awaited<ReturnType<typeof listStockItemsForMovements>>[number]): OpsScanMatchedItem {
  return {
    stockItemId: row.id,
    itemCode: row.item_code,
    description: row.description,
    qtyOnHand: Number(row.qty_on_hand || 0),
    unit: row.unit,
    entityType: row.entity_type,
  };
}

export async function validateOpsScan(
  supabase: SupabaseClient,
  companyId: string,
  input: { barcode: string; workflow: OpsScanWorkflow; context?: OpsScanContext }
): Promise<OpsScanValidationResult> {
  const barcode = input.barcode.trim();
  const context = input.context ?? {};

  if (!barcode) {
    return {
      valid: false,
      status: "unknown",
      barcode,
      workflow: input.workflow,
      recommendation: "Scan a readable barcode or QR code.",
      action: "Retry scan",
    };
  }

  const stockItems = await listStockItemsForMovements(supabase, companyId);
  const stockMatch =
    stockItems.find((item) => matchesBarcode(item.item_code, barcode)) ??
    stockItems.find((item) => matchesBarcode(item.description, barcode));

  if (input.workflow === "dispatch") {
    if (context.storeOrderId) {
      const order = await getStoreOrderDetail(supabase, companyId, context.storeOrderId);
      if (!order) {
        return {
          valid: false,
          status: "not_found",
          barcode,
          workflow: input.workflow,
          recommendation: "Store order not found.",
          action: "Return to dispatch queue",
        };
      }
      const orderMatch = matchesBarcode(order.order_number, barcode);
      return {
        valid: orderMatch,
        status: orderMatch ? "success" : "wrong_item",
        barcode,
        workflow: input.workflow,
        expected: { label: order.order_number },
        actual: { label: barcode },
        recommendation: orderMatch
          ? "Order verified. Confirm loading."
          : `Expected order ${order.order_number}.`,
        action: orderMatch ? "Confirm dispatch" : "Scan correct order label",
        routeHint: `/dispatch/${order.id}`,
      };
    }
  }

  if (!stockMatch) {
    return {
      valid: false,
      status: "unknown",
      barcode,
      workflow: input.workflow,
      actual: { label: barcode },
      recommendation: "Barcode not recognised in VYRON COST inventory.",
      action: "Verify label or contact supervisor",
    };
  }

  const matched = toMatched(stockMatch);

  if (input.workflow === "inventory_lookup" || input.workflow === "inventory_count") {
    return {
      valid: true,
      status: "success",
      barcode,
      workflow: input.workflow,
      matched,
      recommendation: "Stock item verified.",
      action: input.workflow === "inventory_count" ? "Open count screen" : "Open stock record",
      routeHint:
        input.workflow === "inventory_count"
          ? `/inventory/count/${matched.stockItemId}`
          : `/inventory/lookup/${matched.stockItemId}`,
    };
  }

  if (input.workflow === "inventory_transfer") {
    const step = context.transferStep ?? "source";
    if (context.stockItemId && context.stockItemId !== matched.stockItemId) {
      const expected = stockItems.find((item) => item.id === context.stockItemId);
      return {
        valid: false,
        status: "wrong_item",
        barcode,
        workflow: input.workflow,
        matched,
        expected: expected ? { label: expected.description, itemCode: expected.item_code } : undefined,
        actual: { label: matched.description, itemCode: matched.itemCode },
        recommendation: `Scan the ${step} stock item for this transfer.`,
        action: "Scan correct item",
      };
    }
    return {
      valid: true,
      status: "success",
      barcode,
      workflow: input.workflow,
      matched,
      recommendation: step === "source" ? "Source item verified." : "Destination item verified.",
      action: step === "source" ? "Scan destination" : "Complete transfer",
      routeHint: "/inventory/transfer",
    };
  }

  if (input.workflow === "receiving" && context.purchaseOrderId) {
    const detail = await getPurchaseOrderEngineDetail(supabase, companyId, context.purchaseOrderId);
    const lines = detail?.lines ?? [];
    const line =
      lines.find((row) => context.lineId && row.id === context.lineId) ??
      lines.find((row) => matchesBarcode(row.ingredient_name, barcode) || matchesBarcode(row.ingredient_name, matched.description));

    if (!line) {
      return {
        valid: false,
        status: "wrong_item",
        barcode,
        workflow: input.workflow,
        matched,
        actual: { label: matched.description, itemCode: matched.itemCode },
        recommendation: "This item is not on the purchase order.",
        action: "Scan a PO line ingredient",
      };
    }

    const expectedLabel = line.ingredient_name;
    const valid = matchesBarcode(expectedLabel, matched.description) || matchesBarcode(expectedLabel, barcode);
    return {
      valid,
      status: valid ? "success" : "wrong_item",
      barcode,
      workflow: input.workflow,
      matched,
      expected: { label: expectedLabel },
      actual: { label: matched.description, itemCode: matched.itemCode },
      lineId: line.id,
      recommendation: valid ? "PO line verified. Enter receive quantity." : `Expected ${expectedLabel}.`,
      action: valid ? "Populate receive line" : "Scan correct ingredient",
      routeHint: `/receiving/${context.purchaseOrderId}/receive`,
    };
  }

  if (input.workflow === "picking" && context.storeOrderId) {
    const order = await getStoreOrderDetail(supabase, companyId, context.storeOrderId);
    const lines = order?.lines ?? [];
    const line =
      lines.find((row) => context.lineId && row.id === context.lineId) ??
      lines.find(
        (row) =>
          matchesBarcode(row.product_name_snapshot, barcode) ||
          matchesBarcode(row.product_name_snapshot, matched.description)
      );

    if (!line) {
      return {
        valid: false,
        status: "wrong_item",
        barcode,
        workflow: input.workflow,
        matched,
        recommendation: "This product is not on the store order.",
        action: "Scan an order line product",
      };
    }

    const valid =
      matchesBarcode(line.product_name_snapshot, matched.description) ||
      matchesBarcode(line.product_name_snapshot, barcode);
    return {
      valid,
      status: valid ? "success" : "wrong_item",
      barcode,
      workflow: input.workflow,
      matched,
      expected: { label: line.product_name_snapshot },
      actual: { label: matched.description, itemCode: matched.itemCode },
      lineId: line.id,
      recommendation: valid ? "Order line verified." : `Expected ${line.product_name_snapshot}.`,
      action: valid ? "Increment picked quantity" : "Scan correct finished good",
      routeHint: `/picking/${context.storeOrderId}/pick`,
    };
  }

  if (input.workflow === "production" && context.productionRunId) {
    const run = await getStoreProductionRunDetail(supabase, companyId, context.productionRunId);
    const ingredientLines = run?.ingredient_requirements ?? [];
    const line = ingredientLines.find(
      (row) =>
        matchesBarcode(row.ingredient_name, barcode) ||
        matchesBarcode(row.ingredient_name, matched.description) ||
        (context.expectedLabel && matchesBarcode(context.expectedLabel, row.ingredient_name))
    );

    if (!line) {
      return {
        valid: false,
        status: "wrong_item",
        barcode,
        workflow: input.workflow,
        matched,
        recommendation: "Ingredient not required for this production run.",
        action: "Scan a BOM ingredient",
      };
    }

    const valid =
      matchesBarcode(line.ingredient_name, matched.description) ||
      matchesBarcode(line.ingredient_name, barcode);
    return {
      valid,
      status: valid ? "success" : "wrong_item",
      barcode,
      workflow: input.workflow,
      matched,
      expected: { label: line.ingredient_name },
      actual: { label: matched.description, itemCode: matched.itemCode },
      recommendation: valid ? "Ingredient verified for run." : `Expected ${line.ingredient_name}.`,
      action: valid ? "Continue production" : "Prevent wrong ingredient",
      routeHint: `/production/${context.productionRunId}/live`,
    };
  }

  return {
    valid: true,
    status: "success",
    barcode,
    workflow: input.workflow,
    matched,
    recommendation: "Barcode resolved in inventory.",
    action: "Continue workflow",
    routeHint: `/inventory/lookup/${matched.stockItemId}`,
  };
}

export function summarizeScanStats(events: Array<{ status: string; scannedAt: string }>) {
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = events.filter((event) => event.scannedAt.slice(0, 10) === today);
  const failed = todayEvents.filter((event) => event.status !== "success").length;
  const wrong = todayEvents.filter((event) => event.status === "wrong_item").length;
  const success = todayEvents.filter((event) => event.status === "success").length;
  const total = todayEvents.length;
  const verificationRate = total ? `${Math.round((success / total) * 100)}%` : "100%";
  return { scansToday: total, failedScans: failed, wrongItemAttempts: wrong, verificationRate };
}
