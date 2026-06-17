import { NextRequest, NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireAdminSession } from "@/lib/vyron-workspace-admin-server";
import { postOpeningStockBalances } from "@/lib/vyron-import-persist";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireWorkspacePermission("inventory.adjustments.post");
    await requireAdminSession();
    const companyId = await requireApiCompanyId();
    if (!isSupabaseServiceRoleConfigured()) {
      return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 500 });
    }
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

    const body = (await request.json()) as { rows: Record<string, string>[] };
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Rows are required." }, { status: 400 });
    }

    const result = await postOpeningStockBalances(supabase, companyId, body.rows);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Opening stock import failed." },
      { status: 400 }
    );
  }
}
