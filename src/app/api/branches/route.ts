import { NextRequest, NextResponse } from "next/server";
import {
  masterDataErrorResponse,
  optionalText,
  recordMasterDataAudit,
  requireMasterDataContext,
  requiredText,
} from "@/lib/vyron-master-data-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a branch in the signed-in member's own company (admin.company). The
 * Branch Manager used to insert from the browser with the public key and a
 * company id taken from the page.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, companyId, actor } = await requireMasterDataContext("admin.company");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const branch = {
      company_id: companyId,
      branch_name: requiredText(body.branch_name, "Branch name"),
      branch_code: optionalText(body.branch_code, "Branch code", 50),
      city: optionalText(body.city, "City", 120),
      region: optionalText(body.region, "Region", 120),
      contact_email: optionalText(body.contact_email, "Contact e-mail", 200),
      contact_phone: optionalText(body.contact_phone, "Contact phone", 50),
      is_active: true,
    };
    const { data, error } = await supabase.from("vyron_branches").insert(branch).select("*").single();
    if (error || !data) throw new Error(error?.message || "Could not create branch.");
    await recordMasterDataAudit(supabase, {
      companyId,
      eventType: "Branch Created",
      entityName: branch.branch_name,
      detail: `Branch "${branch.branch_name}" created by ${actor}.`,
    });
    return NextResponse.json({ ok: true, branch: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterDataErrorResponse(error, "Could not create branch.");
  }
}
