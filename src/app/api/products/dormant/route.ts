import { NextRequest, NextResponse } from "next/server";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { deleteProduct } from "@/lib/vyron-cost-master-data";
import { listDormantProducts } from "@/lib/vyron-dormant-products";
import { writeInventoryAudit } from "@/lib/vyron-inventory";
import { todaySast } from "@/lib/vyron-period-performance";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const daysParam = (value: unknown) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 30 && n <= 730 ? n : 90;
};

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("products.view");
    const companyId = await requireApiCompanyId();
    const days = daysParam(request.nextUrl.searchParams.get("days"));
    const rows = await listDormantProducts(supabase, companyId, { days, today: todaySast(), search: request.nextUrl.searchParams.get("q") || "" });
    return NextResponse.json({ ok: true, days, rows });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Dormant products could not be loaded.");
  }
}

/**
 * Deactivate (archive) or delete ONE dormant product. The server re-checks that
 * it is still dormant and holds no stock; deletion itself is refused by
 * deleteProduct() whenever any operational record references the product.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  try {
    const session = await requireWorkspacePermission("products.delete");
    const companyId = await requireApiCompanyId();
    const action = body.action === "delete" ? "delete" : body.action === "archive" ? "archive" : null;
    const productId = String(body.productId || "");
    if (!action || !productId) return NextResponse.json({ ok: false, error: "Choose a product and an action (archive or delete)." }, { status: 400 });
    const days = daysParam(body.days);

    const rows = await listDormantProducts(supabase, companyId, { days, today: todaySast() });
    const row = rows.find((r) => r.productId === productId);
    if (!row) return NextResponse.json({ ok: false, error: "Product not found in this workspace." }, { status: 404 });
    if (!row.dormant) return NextResponse.json({ ok: false, error: `${row.description} is not dormant (activity within ${days} days).` }, { status: 409 });
    if (row.qtyOnHand !== 0) {
      return NextResponse.json({ ok: false, error: `${row.description} still has ${row.qtyOnHand} on hand. Clear the stock through a stock count before deactivating it.` }, { status: 409 });
    }

    const result = await deleteProduct(supabase, companyId, productId, { mode: action });
    if (!result.ok) return NextResponse.json(result, { status: 409 });

    const actor = await memberDisplayName(supabase, session);
    await writeInventoryAudit(supabase, {
      companyId,
      eventType: action === "delete" ? "dormant_product_deleted" : "dormant_product_archived",
      actor,
      fieldName: "product_status",
      oldValue: row.status,
      newValue: action === "delete" ? "Deleted" : "Archived",
      detail: `${row.itemCode} ${row.description}: no activity since ${row.lastActivity || "creation"} (${days}-day rule)`,
      referenceType: "product",
      referenceId: productId,
      metadata: { days, lastSaleDate: row.lastSaleDate, lastMovementAt: row.lastMovementAt },
    }).catch((err) => console.error("[dormant-products] audit write failed", err));

    return NextResponse.json(result);
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Dormant product action failed.");
  }
}
