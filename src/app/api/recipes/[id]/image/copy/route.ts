import { NextRequest, NextResponse } from "next/server";

import { copyBomImage } from "@/lib/vyron-cost-bom-copy";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Attach a copy of another BOM's pack photo to this one.
 *
 * A Copy & Edit draft has no BOM to hang a photo on until it is saved, so the
 * photo is brought across here, once the new BOM exists. Both BOMs are read
 * scoped to the verified workspace, so neither the source nor the target can be
 * another tenant's, whatever ids the caller sends. The source is only ever read.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const sourceBomId = String(body.sourceBomId || body.source_bom_id || "");

  try {
    await requireWorkspacePermission("boms.edit");
    const companyId = await requireApiCompanyId();

    if (!sourceBomId) {
      return NextResponse.json({ ok: false, error: "Name the BOM to copy the photo from." }, { status: 400 });
    }

    const [target, source] = await Promise.all([
      supabase
        .from("vyron_cost_boms")
        .select("id")
        .eq("company_id", companyId)
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("vyron_cost_boms")
        .select("id, image_bucket, image_path, image_mime")
        .eq("company_id", companyId)
        .eq("id", sourceBomId)
        .maybeSingle(),
    ]);

    if (!target.data) return NextResponse.json({ ok: false, error: "BOM not found." }, { status: 404 });
    if (!source.data) return NextResponse.json({ ok: false, error: "BOM not found." }, { status: 404 });
    if (!source.data.image_path) return NextResponse.json({ ok: true, copied: false });

    const path = await copyBomImage(supabase, companyId, source.data, id);
    return NextResponse.json({ ok: true, copied: Boolean(path) });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Could not copy the pack photo.");
  }
}
