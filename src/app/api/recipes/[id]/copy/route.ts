import { NextRequest, NextResponse } from "next/server";

import { copyBom } from "@/lib/vyron-cost-bom-copy";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Copy a BOM.
 *
 * The company comes from the verified workspace, never from the request, and the
 * source BOM is read scoped to it — so a caller cannot copy another tenant's BOM
 * by knowing its id, and cannot place the copy anywhere but their own workspace.
 * Creating a BOM is a create, so it is gated on boms.create.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("boms.create");
    const companyId = await requireApiCompanyId();

    const copy = await copyBom(supabase, companyId, id, {
      newName: String(body.newName || body.new_name || ""),
      purpose: body.purpose ?? body.bom_purpose ?? null,
      productId: body.productId ?? body.product_id ?? null,
      copyImage: Boolean(body.copyImage ?? body.copy_image),
    });

    return NextResponse.json({ ok: true, recipe: copy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Copy failed.";
    if (message === "BOM not found.") {
      return NextResponse.json({ ok: false, error: message }, { status: 404 });
    }
    return workspaceAccessErrorResponse(error, "Copy failed.");
  }
}
