import { NextRequest, NextResponse } from "next/server";
import { listVyronStockMovements } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { inventoryCompanyContextFromRequest } from "@/lib/vyron-inventory-api-context";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("inventory.view");
    const companyId = await resolveApiCompanyIdWithContext(supabase, inventoryCompanyContextFromRequest(request));
    if (!companyId) {
      return NextResponse.json({ ok: true, movements: [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const rows = await listVyronStockMovements(supabase, companyId);
    const movements = rows.map((row) => ({
      id: row.id,
      movement_date: row.movement_date,
      movement_type: row.movement_type,
      item_type: row.item_type,
      item_id: row.item_id,
      item_name: row.item_name,
      reference_type: row.movement_type,
      reference_number: row.reference_number,
      quantity_in: Number(row.quantity_in || 0),
      quantity_out: Number(row.quantity_out || 0),
      unit_cost: Number(row.unit_cost || 0),
      total_value: Number(row.total_value || 0),
      location_name: null,
      notes: row.notes,
    }));
    return NextResponse.json({ ok: true, movements }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Stock movements failed.");
  }
}
