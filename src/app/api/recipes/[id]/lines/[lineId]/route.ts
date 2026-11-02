import { NextRequest, NextResponse } from "next/server";
import { RecipeCostUnitError } from "@/lib/vyron-recipe-cost-policy";
import { recipeCostPolicyForRequest } from "@/lib/vyron-recipe-cost-policy-server";

import { deleteRecipeLine, updateRecipeLine } from "@/lib/vyron-cost-recipes-data";

import { requireApiCompanyId } from "@/lib/vyron-api-workspace";

import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

import {

  requireWorkspacePermission,

  workspaceAccessErrorResponse,

} from "@/lib/vyron-workspace-access";



export const runtime = "nodejs";



export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {

  if (!isSupabaseServiceRoleConfigured()) {

    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });

  }

  const supabase = getSupabaseAdmin();

  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });



  const { id, lineId } = await params;

  const body = await request.json().catch(() => ({}));



  try {

    await requireWorkspacePermission("boms.edit");

    const companyId = await requireApiCompanyId();

    const costPolicy = await recipeCostPolicyForRequest();
    const line = await updateRecipeLine(supabase, companyId, id, lineId, body, costPolicy);

    return NextResponse.json({ ok: true, line, costCorrections: costPolicy.corrections });

  } catch (error) {

    if (error instanceof RecipeCostUnitError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return workspaceAccessErrorResponse(error, "Update line failed.");

  }

}



export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {

  if (!isSupabaseServiceRoleConfigured()) {

    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });

  }

  const supabase = getSupabaseAdmin();

  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });



  const { id, lineId } = await params;



  try {

    await requireWorkspacePermission("boms.edit");

    const companyId = await requireApiCompanyId();

    await deleteRecipeLine(supabase, companyId, id, lineId);

    return NextResponse.json({ ok: true });

  } catch (error) {

    if (error instanceof RecipeCostUnitError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return workspaceAccessErrorResponse(error, "Delete line failed.");

  }

}


