import { NextRequest, NextResponse } from "next/server";
import {
  findOrCreateStockItem,
  listStockItems,
  postOpeningStockMovement,
  syncStockItemsFromMasters,
  type StockEntityType,
} from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import {
  inventoryCompanyContextFromRequest,
  requireInventoryCompanyId,
} from "@/lib/vyron-inventory-api-context";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function makeItemCode(entityType: StockEntityType, description: string) {
  const prefix = entityType === "finished_goods" ? "FG" : entityType === "packaging" ? "PKG" : "ING";
  const clean = description
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 18);
  return `${prefix}-${clean || Date.now()}`;
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const entityType = request.nextUrl.searchParams.get("entityType") || undefined;
  const status = request.nextUrl.searchParams.get("status") || undefined;
  const search = request.nextUrl.searchParams.get("search") || undefined;
  try {
    await requireWorkspacePermission("inventory.view");
    const companyId = await resolveApiCompanyIdWithContext(supabase, inventoryCompanyContextFromRequest(request));
    if (!companyId) return NextResponse.json({ ok: true, items: [] }, { headers: { "Cache-Control": "no-store" } });
    const items = await listStockItems(supabase, companyId, { entityType, status, search });
    return NextResponse.json({ ok: true, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List failed.");
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
    await requireWorkspacePermission("inventory.adjustments.post");
    const companyId = await requireInventoryCompanyId(supabase, inventoryCompanyContextFromRequest(request, body));

    if (body.action === "sync") {
      const result = await syncStockItemsFromMasters(supabase, companyId);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "create") {
      const entityType = String(body.entityType || "ingredient") as StockEntityType;
      if (!["ingredient", "packaging", "finished_goods"].includes(entityType)) {
        return NextResponse.json({ ok: false, error: "Invalid inventory type." }, { status: 400 });
      }

      const description = String(body.description || "").trim();
      if (!description) return NextResponse.json({ ok: false, error: "Description is required." }, { status: 400 });

      const currentCost = Number(body.currentCost || 0);
      const openingQty = Number(body.openingQty || 0);
      const itemCode = String(body.itemCode || "").trim() || makeItemCode(entityType, description);

      const entityId = body.entityId ? String(body.entityId) : undefined;

      const item = await findOrCreateStockItem(supabase, companyId, {
        entityType,
        entityId,
        itemCode,
        description,
        category: String(body.category || "Uncategorised"),
        unit: String(body.unit || (entityType === "finished_goods" ? "unit" : "kg")),
        currentCost,
        reorderLevel: Number(body.reorderLevel || 0),
        minLevel: Number(body.minLevel || 0),
        maxLevel: Number(body.maxLevel || 0),
      });

      if (openingQty > 0) {
        const openingDate = body.openingDate ? String(body.openingDate) : undefined;
        const openingNote = body.openingNote ? String(body.openingNote).trim() : "Manual opening stock";
        await postOpeningStockMovement(supabase, {
          companyId,
          stockItemId: item.id,
          quantity: openingQty,
          unitCost: currentCost,
          movementDate: openingDate,
          referenceNote: openingNote,
          actor: "user",
          allowDuplicate: Boolean(body.allowDuplicate),
        });

        if (entityType === "finished_goods" && entityId) {
          await supabase
            .from("vyron_finished_goods")
            .update({
              current_stock: openingQty,
              stock_value: Math.round(openingQty * currentCost * 100) / 100,
              updated_at: new Date().toISOString(),
            })
            .eq("id", entityId)
            .eq("company_id", companyId);
        }
      }

      return NextResponse.json({ ok: true, item });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Inventory update failed.");
  }
}
