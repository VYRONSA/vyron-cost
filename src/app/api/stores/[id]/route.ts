import { NextRequest, NextResponse } from "next/server";
import { deleteStore, getStoreById, updateStore } from "@/lib/vyron-store-orders";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("stores");
    await requireWorkspacePermission("stores.view");
    const companyId = await requireApiCompanyId();

    const { id } = await context.params;
    const store = await getStoreById(supabase, companyId, id);
    if (!store) return NextResponse.json({ ok: false, error: "Store not found." }, { status: 404 });
    return NextResponse.json({ ok: true, store });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Get store failed.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requirePackageFeature("stores");
    await requireWorkspacePermission("stores.edit");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    const store = await updateStore(supabase, companyId, id, body);
    return NextResponse.json({ ok: true, store });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update store failed.");
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("stores");
    await requireWorkspacePermission("stores.delete");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    await deleteStore(supabase, companyId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete store failed.");
  }
}
