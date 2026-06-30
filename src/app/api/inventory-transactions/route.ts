import { NextRequest, NextResponse } from "next/server";
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

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requirePackageFeature("inventory");
    await requireWorkspacePermission("inventory.adjustments.post");
    const companyId = await requireApiCompanyId();
    const action = String(body.action || body.transaction_type || "Receipt");

    if (action === "transfer") {
      const result = await postInventoryTransfer(supabase, {
        companyId,
        fromStockItemId: String(body.from_stock_item_id),
        toStockItemId: String(body.to_stock_item_id),
        quantity: Number(body.quantity),
        unitCost: body.unit_cost != null ? Number(body.unit_cost) : undefined,
        notes: body.notes,
        createdBy: body.created_by,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "count" || action === "Count") {
      const transaction = await postInventoryStockCount(supabase, {
        companyId,
        stockItemId: String(body.stock_item_id),
        countedQty: Number(body.counted_qty),
        notes: body.notes,
        createdBy: body.created_by,
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

    const quantity = Number(body.quantity);
    const signedQuantity =
      transactionType === "Adjustment" ? Number(body.quantity_delta ?? body.quantity) : quantity;

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
      createdBy: body.created_by,
      itemCode: body.item_code,
      itemDescription: body.item_description,
      allowNegative: Boolean(body.allow_negative),
    });

    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Post inventory transaction failed.");
  }
}
