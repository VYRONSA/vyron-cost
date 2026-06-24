import { NextResponse } from "next/server";
import { getImportCentreStats } from "@/lib/vyron-import-centre-v1";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  try {
    await requireWorkspacePermission("ingredients.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json({
        ok: true,
        stats: { rawMaterials: 0, finishedGoods: 0, boms: 0 },
      });
    }

    const stats = await getImportCentreStats(supabase, companyId);
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Import centre stats failed.");
  }
}
