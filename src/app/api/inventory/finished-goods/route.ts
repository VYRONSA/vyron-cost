import { NextRequest, NextResponse } from "next/server";
import { listStockBackedFinishedGoodsForInvoice } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { inventoryCompanyContextFromRequest } from "@/lib/vyron-inventory-api-context";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import {
  WorkspaceAccessError,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";
import { sessionHasPermission } from "@/lib/vyron-workspace-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireInvoiceOrInventoryView() {
  const session = await getServerWorkspaceSession();
  if (!session) {
    throw new WorkspaceAccessError("Workspace session required.", 401);
  }
  if (!sessionHasPermission(session, "invoices.view") && !sessionHasPermission(session, "inventory.view")) {
    throw new WorkspaceAccessError("Access denied.", 403);
  }
  return session;
}

function mapStatus(stockStatus: string | null | undefined, qty: number) {
  if (stockStatus === "Low Stock" || stockStatus === "Out Of Stock" || qty <= 0) return "Low Stock";
  if (stockStatus === "Overstock") return "Overstocked";
  if (stockStatus === "Slow Moving") return "Watch";
  return "Healthy";
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireInvoiceOrInventoryView();
    const companyId = await resolveApiCompanyIdWithContext(supabase, inventoryCompanyContextFromRequest(request));
    if (!companyId) {
      return NextResponse.json({ ok: true, items: [], totalValue: 0 }, { headers: { "Cache-Control": "no-store" } });
    }
    const rows = await listStockBackedFinishedGoodsForInvoice(supabase, companyId);
    const items = rows.map((row) => ({
      id: row.productId,
      productId: row.productId,
      product_name: row.productName,
      sku: row.sku,
      current_stock: row.stockOnHand,
      qty_on_hand: row.stockOnHand,
      average_unit_cost: row.unitCost,
      selling_price: row.sellingPrice,
      stock_value: row.inventoryValue,
      last_manufactured_at: "",
      sales_velocity_30_days: 0,
      days_cover: row.stockOnHand > 0 ? 30 : 0,
      status: mapStatus(row.stockStatus, row.stockOnHand),
    }));
    const totalValue = items.reduce((sum, item) => sum + item.stock_value, 0);
    return NextResponse.json(
      { ok: true, items, totalValue },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Finished goods failed.");
  }
}
