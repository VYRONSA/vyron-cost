import { NextRequest, NextResponse } from "next/server";
import { recalculateBomsUsingIngredient } from "@/lib/vyron-cost-ingredient-intelligence";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;

  try {
    await requireWorkspacePermission("ingredients.edit");
    const companyId = await requireApiCompanyId();
    const cascade = await recalculateBomsUsingIngredient(supabase, companyId, id);
    return NextResponse.json({ ok: true, ...cascade });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Recalculate failed.");
  }
}
