import { NextRequest, NextResponse } from "next/server";
import { createStockCount, listStockItems, syncStockItemsFromMasters } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import {
  inventoryCompanyContextFromRequest,
  requireInventoryCompanyId,
} from "@/lib/vyron-inventory-api-context";
import { getAuthUserIdFromCookies } from "@/lib/vyron-workspace-auth";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CountType = "ingredients" | "packaging" | "finished_goods";

function normaliseCountType(value: unknown): CountType | null {
  const next = String(value || "").trim();
  if (next === "ingredients" || next === "packaging" || next === "finished_goods") return next;
  return null;
}

function entityTypeForCount(type: CountType) {
  if (type === "ingredients") return "ingredient";
  if (type === "packaging") return "packaging";
  return "finished_goods";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireActorUserId() {
  const authUserId = await getAuthUserIdFromCookies();
  if (authUserId && UUID_RE.test(authUserId)) return authUserId;

  const session = await requireWorkspacePermission("inventory.counts.create");
  if (UUID_RE.test(session.userId)) return session.userId;

  throw new Error("Authenticated user UUID required to create stock counts.");
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("inventory.view");
    const companyId = await resolveApiCompanyIdWithContext(supabase, inventoryCompanyContextFromRequest(request));
    if (!companyId) return NextResponse.json({ ok: true, counts: [] }, { headers: { "Cache-Control": "no-store" } });

    const { data, error } = await supabase
      .from("vyron_cost_stock_counts")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, counts: data || [] }, { headers: { "Cache-Control": "no-store" } });
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
  const countType = normaliseCountType(body.countType);
  if (!countType) return NextResponse.json({ ok: false, error: "countType required." }, { status: 400 });

  try {
    const createdBy = await requireActorUserId();
    const companyId = await requireInventoryCompanyId(supabase, inventoryCompanyContextFromRequest(request, body));

    let items = await listStockItems(supabase, companyId, { entityType: entityTypeForCount(countType) });

    if (items.length === 0) {
      await syncStockItemsFromMasters(supabase, companyId);
      items = await listStockItems(supabase, companyId, { entityType: entityTypeForCount(countType) });
    }

    const result = await createStockCount(
      supabase,
      companyId,
      countType,
      createdBy,
      {
        notes: body.notes ? String(body.notes) : undefined,
        warehouseName: body.warehouseName ? String(body.warehouseName) : undefined,
        locationName: body.locationName ? String(body.locationName) : undefined,
      }
    );
    return NextResponse.json({ ok: true, ...result, stockItemsFound: items.length });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create failed.");
  }
}
