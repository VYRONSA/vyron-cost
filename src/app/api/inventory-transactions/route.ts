import { NextRequest, NextResponse } from "next/server";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import {
  listInventoryTransactions,
  postInventoryStockCount,
  postInventoryTransaction,
  postInventoryTransfer,
} from "@/lib/vyron-inventory-transactions";
import type { StockEntityType } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("inventory");
    await requireWorkspacePermission("inventory.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, transactions: [] });

    const transactions = await listInventoryTransactions(supabase, companyId, { limit: 500 });
    return NextResponse.json({ ok: true, transactions });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List inventory transactions failed.");
  }
}

/**
 * A quantity from the browser is only usable when it was actually entered.
 * `Number("")` is 0 and `Number(undefined)` is NaN: the first silently zeroed a
 * stock count, the second slipped past the engine's `=== 0` guard.
 */
function enteredNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requirePackageFeature("inventory");
    const session = await requireWorkspacePermission("inventory.adjustments.post");
    const companyId = await requireApiCompanyId();
    // Who posted is the verified member; a browser-sent `created_by` is ignored.
    const createdBy = await memberDisplayName(supabase, session);
    const action = String(body.action || body.transaction_type || "Receipt");

    if (action === "transfer") {
      const qty = enteredNumber(body.quantity);
      if (qty === null || qty <= 0) return badRequest("Enter a quantity greater than zero.");
      const result = await postInventoryTransfer(supabase, {
        companyId,
        fromStockItemId: String(body.from_stock_item_id),
        toStockItemId: String(body.to_stock_item_id),
        quantity: Number(body.quantity),
        unitCost: body.unit_cost != null ? Number(body.unit_cost) : undefined,
        notes: body.notes,
        createdBy,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action !== "transfer" && !body.stock_item_id && !body.entity_id) return badRequest("Select a stock item.");
    if (body.unit_cost != null && body.unit_cost !== "") {
      const cost = enteredNumber(body.unit_cost);
      if (cost === null || cost < 0) return badRequest("Unit cost must be zero or more.");
    }

    if (action === "count" || action === "Count") {
      const counted = enteredNumber(body.counted_qty);
      if (counted === null || counted < 0) return badRequest("Enter the counted quantity (zero or more).");
      const transaction = await postInventoryStockCount(supabase, {
        companyId,
        stockItemId: String(body.stock_item_id),
        countedQty: Number(body.counted_qty),
        notes: body.notes,
        createdBy,
      });
      return NextResponse.json({ ok: true, transaction });
    }

    const transactionType =
      action === "receive" || action === "Receipt"
        ? "Receipt"
        : action === "issue" || action === "Issue"
          ? "Issue"
          : action === "adjust" || action === "Adjustment"
            ? "Adjustment"
            : action;

    const quantity = enteredNumber(body.quantity);
    const signedQuantity =
      transactionType === "Adjustment" ? enteredNumber(body.quantity_delta ?? body.quantity) : quantity;
    if (signedQuantity === null || signedQuantity === 0) {
      return badRequest(transactionType === "Adjustment" ? "Enter a non-zero adjustment (+ or −)." : "Enter a quantity greater than zero.");
    }
    if (transactionType !== "Adjustment" && signedQuantity < 0) return badRequest("Enter a quantity greater than zero.");

    const transaction = await postInventoryTransaction(supabase, {
      companyId,
      transactionType: transactionType as "Receipt" | "Issue" | "Adjustment",
      entityType: (body.entity_type || "ingredient") as StockEntityType,
      entityId: body.entity_id || null,
      stockItemId: body.stock_item_id || null,
      quantity: signedQuantity,
      unitCost: body.unit_cost != null ? Number(body.unit_cost) : undefined,
      referenceType: body.reference_type,
      referenceId: body.reference_id,
      referenceLabel: body.reference_label,
      notes: body.notes,
      createdBy,
      itemCode: body.item_code,
      itemDescription: body.item_description,
      allowNegative: Boolean(body.allow_negative),
    });

    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Post inventory transaction failed.");
  }
}
