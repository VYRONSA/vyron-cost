import { NextRequest, NextResponse } from "next/server";
import { RecipeCostUnitError } from "@/lib/vyron-recipe-cost-policy";
import { recipeCostPolicyForRequest } from "@/lib/vyron-recipe-cost-policy-server";

import { createRecipeLine, listRecipeLines } from "@/lib/vyron-cost-recipes-data";

import { requireApiCompanyId } from "@/lib/vyron-api-workspace";

import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

import {

  requireWorkspacePermission,

  workspaceAccessErrorResponse,

} from "@/lib/vyron-workspace-access";



export const runtime = "nodejs";



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

    const lines = await listRecipeLines(supabase, companyId, id);

    return NextResponse.json({ ok: true, lines });

  } catch (error) {

    if (error instanceof RecipeCostUnitError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return workspaceAccessErrorResponse(error, "List lines failed.");

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

    await requireWorkspacePermission("boms.edit");

    const companyId = await requireApiCompanyId();

    const costPolicy = await recipeCostPolicyForRequest();
    const line = await createRecipeLine(supabase, companyId, id, {

      line_type: String(body.line_type || "Ingredient"),

      ingredient_id: body.ingredient_id,

      component_id: body.component_id,

      line_name: String(body.line_name || ""),

      quantity: Number(body.quantity || 0),

      unit: String(body.unit || "kg"),

      unit_cost: Number(body.unit_cost || 0),

      wastage_percent: Number(body.wastage_percent || 0),

      sort_order: body.sort_order,
      cost_override_reason: body.cost_override_reason ?? null,

    }, costPolicy);

    return NextResponse.json({ ok: true, line, costCorrections: costPolicy.corrections });

  } catch (error) {

    if (error instanceof RecipeCostUnitError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return workspaceAccessErrorResponse(error, "Create line failed.");

  }

}


