import { NextRequest, NextResponse } from "next/server";
import { deleteProduct, updateProduct } from "@/lib/vyron-cost-master-data";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("products.edit");
    const companyId = await requireApiCompanyId();
    const product = await updateProduct(supabase, companyId, id, body);
    return NextResponse.json({ ok: true, product });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update failed.");
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;
  const mode = _request.nextUrl.searchParams.get("mode") === "archive" ? "archive" : "delete";

  try {
    await requireWorkspacePermission("products.delete");
    const companyId = await requireApiCompanyId();
    const result = await deleteProduct(supabase, companyId, id, { mode });

    if (!result.ok && result.code === "PRODUCT_REFERENCED") {
      return NextResponse.json(result, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return workspaceAccessErrorResponse(error, mode === "archive" ? "Archive failed." : "Delete failed.");
  }
}
