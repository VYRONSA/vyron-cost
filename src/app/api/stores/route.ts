import { NextRequest, NextResponse } from "next/server";
import { createStore, listStores } from "@/lib/vyron-store-orders";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { assertOperationsSchemaReady } from "@/lib/vyron-schema-readiness";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("stores");
    await requireWorkspacePermission("stores.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, stores: [] });

    await assertOperationsSchemaReady(supabase, ["vyron_cost_stores"]);

    const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "true";
    const stores = await listStores(supabase, companyId, activeOnly);
    return NextResponse.json({ ok: true, stores });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List stores failed.");
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requirePackageFeature("stores");
    await requireWorkspacePermission("stores.create");
    const companyId = await requireApiCompanyId();
    await assertOperationsSchemaReady(supabase, ["vyron_cost_stores"]);
    const store = await createStore(supabase, companyId, {
      store_code: String(body.store_code || ""),
      store_name: String(body.store_name || ""),
      address: body.address,
      contact_name: body.contact_name,
      contact_email: body.contact_email,
      contact_phone: body.contact_phone,
      status: body.status,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, store });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Create store failed.");
  }
}
