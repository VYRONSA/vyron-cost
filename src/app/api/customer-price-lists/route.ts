import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  PriceListError,
  assignCustomerPriceLists,
  createCustomerPriceList,
  listCustomerPriceListAssignments,
  listCustomerPriceLists,
  upsertCustomerPriceListItems,
} from "@/lib/vyron-customer-price-lists";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof PriceListError) return bad(error.message, error.status);
  return workspaceAccessErrorResponse(error, fallback);
}

/*
 * The company is the one the signed-in member's workspace owns
 * (requireApiCompanyId), which fails closed (403) when none can be authorised,
 * like the other write routes. Every list, customer and product id in a request
 * body is then re-checked against that company in vyron-customer-price-lists.ts;
 * upsert_items and assign previously accepted another company's ids.
 */

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("sales_orders.view");
    const companyId = await requireApiCompanyId();

    const [lists, assignments] = await Promise.all([
      listCustomerPriceLists(supabase, companyId),
      listCustomerPriceListAssignments(supabase, companyId),
    ]);

    return NextResponse.json({ ok: true, lists, assignments });
  } catch (error) {
    return errorResponse(error, "Unable to load customer price lists.");
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    const session = await requireWorkspacePermission("sales_orders.edit");
    const companyId = await requireApiCompanyId();

    const body = await request.json();
    const mode = String(body?.mode || "create_list");
    // Who did it comes from the verified session, not the request.
    const actor = String(session.userId || "").trim() || "user";

    if (mode === "create_list") {
      const listName = String(body?.listName || "").trim();
      if (!listName) return bad("listName is required.");
      const list = await createCustomerPriceList(supabase, companyId, {
        listName,
        listType: body?.listType === "Contract" ? "Contract" : "Standard",
        status: body?.status === "Inactive" ? "Inactive" : "Active",
        effectiveFrom: body?.effectiveFrom || null,
        effectiveTo: body?.effectiveTo || null,
        notes: body?.notes || null,
        createdBy: actor,
      });
      return NextResponse.json({ ok: true, list });
    }

    if (mode === "upsert_items") {
      const priceListId = String(body?.priceListId || "").trim();
      const items = Array.isArray(body?.items) ? body.items : [];
      if (!priceListId) return bad("priceListId is required.");
      if (!items.length) return bad("items is required.");
      const result = await upsertCustomerPriceListItems(supabase, companyId, {
        priceListId,
        items,
        actor,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (mode === "assign") {
      const customerId = String(body?.customerId || "").trim();
      if (!customerId) return bad("customerId is required.");
      const assignment = await assignCustomerPriceLists(supabase, companyId, {
        customerId,
        defaultPriceListId: body?.defaultPriceListId || null,
        contractPriceListId: body?.contractPriceListId || null,
        status: body?.status === "Inactive" ? "Inactive" : "Active",
        notes: body?.notes || null,
        actor,
      });
      return NextResponse.json({ ok: true, assignment });
    }

    return bad("Unsupported mode.");
  } catch (error) {
    return errorResponse(error, "Unable to save customer price list.");
  }
}
