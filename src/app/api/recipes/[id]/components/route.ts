import { NextRequest, NextResponse } from "next/server";

import { createRecipeComponent, listRecipeComponents } from "@/lib/vyron-cost-recipes-data";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

/**
 * Components belong to one BOM. The company always comes from the verified
 * workspace, never from the request, so a component can only be listed or
 * created against a recipe the caller's own tenant owns.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;

  try {
    await requireWorkspacePermission("boms.view");
    const companyId = await requireApiCompanyId();
    const components = await listRecipeComponents(supabase, companyId, id);
    return NextResponse.json({ ok: true, components });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List components failed.");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("boms.create");
    const companyId = await requireApiCompanyId();
    const component = await createRecipeComponent(supabase, companyId, id, {
      name: String(body.name || ""),
      component_type: body.component_type,
      sort_order: body.sort_order,
      yield_qty: body.yield_qty,
      yield_unit: body.yield_unit,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, component });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create component failed.");
  }
}
