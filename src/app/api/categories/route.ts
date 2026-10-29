import { NextRequest, NextResponse } from "next/server";
import {
  CATEGORY_STATUSES,
  CATEGORY_TYPES,
  masterDataErrorResponse,
  oneOf,
  optionalText,
  recordMasterDataAudit,
  requireMasterDataContext,
  requiredText,
} from "@/lib/vyron-master-data-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a category in the signed-in member's own company (products.edit).
 * Only the category's own fields are written; its Xero account mapping is saved
 * by /api/integrations/xero/accounts, as before. The Categories screen used to
 * insert from the browser with the public key and a company id from the page.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, companyId, actor } = await requireMasterDataContext("products.edit");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const category = {
      company_id: companyId,
      category_name: requiredText(body.category_name, "Category name"),
      category_type: oneOf(body.category_type, CATEGORY_TYPES, "Category type"),
      description: optionalText(body.description, "Description", 1000),
      status: oneOf(body.status, CATEGORY_STATUSES, "Status"),
    };
    const { data, error } = await supabase.from("vyron_cost_categories").insert(category).select("*").single();
    if (error || !data) throw new Error(error?.message || "Could not save category.");
    await recordMasterDataAudit(supabase, {
      companyId,
      eventType: "Category Created",
      entityName: category.category_name,
      detail: `${category.category_type} category "${category.category_name}" created by ${actor}.`,
    });
    return NextResponse.json({ ok: true, category: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterDataErrorResponse(error, "Could not save category.");
  }
}
