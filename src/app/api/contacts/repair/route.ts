import { NextResponse } from "next/server";
import { getContactStatistics, repairContactMasterFlags } from "@/lib/vyron-contact-master";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function POST() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  try {
    await requireWorkspacePermission("customers.edit");
    const companyId = await requireApiCompanyId();
    await resolveAndAlignApiCompanyId();

    const result = await repairContactMasterFlags(supabase, companyId);
    const stats = await getContactStatistics(supabase, companyId);

    const aligned =
      result.after.contactsIsCustomer === result.after.vyronCustomers &&
      result.after.contactsIsSupplier === result.after.vyronSuppliers;

    return NextResponse.json({
      ok: true,
      companyId,
      aligned,
      ...result,
      stats,
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Contact master repair failed.");
  }
}
