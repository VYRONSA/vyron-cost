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

type SortKey =
  | "name"
  | "code"
  | "category"
  | "status"
  | "standard_cost"
  | "current_cost"
  | "selling_price"
  | "gross_profit"
  | "gross_profit_percent"
  | "updated_at";

function normalizeSortKey(raw: string | null): SortKey {
  const key = String(raw || "name").toLowerCase();
  if (key === "code") return "code";
  if (key === "category") return "category";
  if (key === "status") return "status";
  if (key === "standard_cost") return "standard_cost";
  if (key === "current_cost") return "current_cost";
  if (key === "selling_price") return "selling_price";
  if (key === "gross_profit") return "gross_profit";
  if (key === "gross_profit_percent") return "gross_profit_percent";
  if (key === "updated_at") return "updated_at";
  return "name";
}

function normalizeSortDirection(raw: string | null): "asc" | "desc" {
  return String(raw || "asc").toLowerCase() === "desc" ? "desc" : "asc";
}

function normalizeActivityStatus(value: string | null | undefined): "Active" | "Inactive" {
  const next = String(value || "active").toLowerCase();
  if (next === "inactive" || next === "archived" || next === "disabled") return "Inactive";
  return "Active";
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
    const search = String(request.nextUrl.searchParams.get("search") || "").trim().toLowerCase();
    const category = String(request.nextUrl.searchParams.get("category") || "").trim().toLowerCase();
    const activityStatusFilter = String(request.nextUrl.searchParams.get("status") || "").trim().toLowerCase();
    const sortKey = normalizeSortKey(request.nextUrl.searchParams.get("sortBy"));
    const sortDirection = normalizeSortDirection(request.nextUrl.searchParams.get("sortDirection"));

    const rows = await listStockBackedFinishedGoodsForInvoice(supabase, companyId);
    const rawItems = rows.map((row) => {
      const currentCost = Number(row.unitCost || 0);
      const sellingPrice = Number(row.sellingPrice || 0);
      const grossProfit = sellingPrice - currentCost;
      const grossProfitPercent = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;

      return {
      id: row.productId,
      productId: row.productId,
      product_name: row.productName,
      sku: row.sku,
      code: row.sku || "",
      category: row.category,
      unit_of_measure: row.unitOfMeasure,
      standard_cost: Number(row.standardCost || 0),
      current_stock: row.stockOnHand,
      qty_on_hand: row.stockOnHand,
      average_unit_cost: row.unitCost,
      selling_price: row.sellingPrice,
      stock_value: row.inventoryValue,
      gross_profit: grossProfit,
      gross_profit_percent: grossProfitPercent,
      activity_status: row.activityStatus,
      linked_bom_id: row.linkedBomId,
      recipe_bom_version: row.linkedBomName || "",
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      last_manufactured_at: "",
      sales_velocity_30_days: 0,
      days_cover: row.stockOnHand > 0 ? 30 : 0,
      status: mapStatus(row.stockStatus, row.stockOnHand),
      };
    });

    const filtered = rawItems.filter((item) => {
      if (search) {
        const haystack = [item.product_name, item.sku, item.code, item.category]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      if (category && String(item.category || "").toLowerCase() !== category) {
        return false;
      }

      if (activityStatusFilter === "active" || activityStatusFilter === "inactive") {
        if (String(item.activity_status).toLowerCase() !== activityStatusFilter) return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      const direction = sortDirection === "desc" ? -1 : 1;

      if (sortKey === "code") return a.code.localeCompare(b.code) * direction;
      if (sortKey === "category") return String(a.category || "").localeCompare(String(b.category || "")) * direction;
      if (sortKey === "status") return normalizeActivityStatus(a.activity_status).localeCompare(normalizeActivityStatus(b.activity_status)) * direction;
      if (sortKey === "standard_cost") return (a.standard_cost - b.standard_cost) * direction;
      if (sortKey === "current_cost") return (a.average_unit_cost - b.average_unit_cost) * direction;
      if (sortKey === "selling_price") return (a.selling_price - b.selling_price) * direction;
      if (sortKey === "gross_profit") return (a.gross_profit - b.gross_profit) * direction;
      if (sortKey === "gross_profit_percent") return (a.gross_profit_percent - b.gross_profit_percent) * direction;
      if (sortKey === "updated_at") {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return (aTime - bTime) * direction;
      }
      return a.product_name.localeCompare(b.product_name) * direction;
    });
    const items = filtered;
    const totalValue = items.reduce((sum, item) => sum + item.stock_value, 0);
    return NextResponse.json(
      { ok: true, items, totalValue },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Finished goods failed.");
  }
}
