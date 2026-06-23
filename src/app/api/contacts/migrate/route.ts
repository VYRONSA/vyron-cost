import { NextResponse } from "next/server";
import { migrateExistingContactsToMaster } from "@/lib/vyron-contact-master";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
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
    const result = await migrateExistingContactsToMaster(supabase, companyId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Contact migration failed.");
  }
}
