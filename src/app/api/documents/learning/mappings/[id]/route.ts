import { NextRequest, NextResponse } from "next/server";
import { updateSupplierLineMapping } from "@/lib/vyron-supplier-line-learning";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as {
    entityType?: "ingredient" | "packaging" | "product";
    entityId?: string | null;
    entityName?: string | null;
    disabled?: boolean;
    sourceDescription?: string;
    unit?: string | null;
  };

  try {
    const companyId = await requireApiCompanyId();
    const mapping = await updateSupplierLineMapping(supabase, companyId, id, {
      entityType: body.entityType,
      entityId: body.entityId,
      entityName: body.entityName,
      disabled: body.disabled,
      sourceDescription: body.sourceDescription,
      unit: body.unit,
      approvedBy: "supplier-learning-admin",
    });
    return NextResponse.json({ ok: true, mapping });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not update mapping." },
      { status: 400 }
    );
  }
}
