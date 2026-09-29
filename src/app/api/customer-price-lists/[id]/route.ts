import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  PriceListError,
  addCustomerPriceListItem,
  getCustomerPriceListDetail,
  setCustomerPriceListItemStatus,
  updateCustomerPriceListItemPrice,
} from "@/lib/vyron-customer-price-lists";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * One customer price list: view it, add a product, change a price, take a
 * product off (Inactive) or put it back.
 *
 * The company is the one the signed-in member's workspace owns. The list id in
 * the path, and the item and product ids in the body, are requests only: each
 * is re-checked against that company (and the item against this list) in
 * vyron-customer-price-lists.ts before anything is read or written. Nothing in
 * the body can name a company, a customer or another list.
 */

function reply(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof PriceListError) return reply(error.message, error.status);
  return workspaceAccessErrorResponse(error, fallback);
}

async function context(permission: string) {
  if (!isSupabaseServiceRoleConfigured()) throw new PriceListError("SUPABASE_SERVICE_ROLE_KEY is required.", 500);
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new PriceListError("Supabase unavailable.", 500);
  const session = await requireWorkspacePermission(permission);
  const companyId = await requireApiCompanyId();
  return { supabase, companyId, actor: String(session.userId || "").trim() || "user" };
}

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    throw new PriceListError("Invalid request.");
  }
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { supabase, companyId } = await context("sales_orders.view");
    const { id } = await params;
    const detail = await getCustomerPriceListDetail(supabase, companyId, id);
    return NextResponse.json({ ok: true, ...detail });
  } catch (error) {
    return errorResponse(error, "Unable to load the price list.");
  }
}

/** Add a product to the list: { productId, price }. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { supabase, companyId, actor } = await context("sales_orders.edit");
    const { id } = await params;
    const body = await readBody(request);
    const result = await addCustomerPriceListItem(supabase, companyId, {
      priceListId: id,
      productId: String(body.productId || ""),
      price: body.price,
      actor,
    });
    return NextResponse.json({ ok: true, ...result }, { status: result.reactivated ? 200 : 201 });
  } catch (error) {
    return errorResponse(error, "Unable to add the product.");
  }
}

/** Change one item: { itemId, price } or { itemId, status: "Active" | "Inactive" }. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { supabase, companyId, actor } = await context("sales_orders.edit");
    const { id } = await params;
    const body = await readBody(request);
    const itemId = String(body.itemId || "");
    if (body.price !== undefined && body.status !== undefined) {
      throw new PriceListError("Change the price or the status, not both at once.");
    }
    if (body.price !== undefined) {
      const result = await updateCustomerPriceListItemPrice(supabase, companyId, { priceListId: id, itemId, price: body.price, actor });
      return NextResponse.json({ ok: true, ...result });
    }
    if (body.status !== undefined) {
      const result = await setCustomerPriceListItemStatus(supabase, companyId, { priceListId: id, itemId, status: body.status, actor });
      return NextResponse.json({ ok: true, ...result });
    }
    throw new PriceListError("Nothing to change.");
  } catch (error) {
    return errorResponse(error, "Unable to update the price list.");
  }
}
