import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireActiveWorkspaceId, requireAdminSession } from "@/lib/vyron-workspace-admin-server";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export const runtime = "nodejs";

/**
 * Accounting item code -> VYRON product mappings.
 *
 * Every read and write is scoped to the active company, so a mapping saved for
 * one client never resolves for another. Persisted in the database, so mappings
 * survive logout, redeploy and cold start.
 */
async function resolveContext() {
  await requireAdminSession("admin.imports");
  await requireActiveWorkspaceId();
  const companyId = await getWorkspaceCompanyId();
  if (!companyId) throw new Error("No active company.");
  return companyId;
}

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    const companyId = await resolveContext();
    const [{ data: mappings, error }, { data: products }] = await Promise.all([
      supabase
        .from("vyron_customer_item_mappings")
        .select("id, source_item_code, source_description, product_id, updated_at")
        .eq("company_id", companyId)
        .order("source_item_code"),
      supabase
        .from("vyron_cost_products")
        .select("id, product_name")
        .eq("company_id", companyId)
        .order("product_name"),
    ]);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, mappings: mappings || [], products: products || [] });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load mappings." },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    const companyId = await resolveContext();
    const body = (await request.json()) as {
      sourceItemCode?: string;
      sourceDescription?: string;
      productId?: string;
    };

    const code = (body.sourceItemCode || "").trim();
    const description = (body.sourceDescription || "").trim();
    const productId = (body.productId || "").trim();

    if (!code && !description) {
      return NextResponse.json(
        { ok: false, error: "sourceItemCode or sourceDescription is required." },
        { status: 400 }
      );
    }
    if (!productId) {
      return NextResponse.json({ ok: false, error: "productId is required." }, { status: 400 });
    }

    // The target must be an existing product in THIS company. Never create one.
    const { data: product } = await supabase
      .from("vyron_cost_products")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", productId)
      .maybeSingle();
    if (!product) {
      return NextResponse.json(
        { ok: false, error: "Product not found in the active company." },
        { status: 400 }
      );
    }

    const payload = {
      company_id: companyId,
      source_item_code: code || null,
      source_description: description || null,
      product_id: productId,
      updated_at: new Date().toISOString(),
    };

    // Idempotent per (company, item code); description-only mappings match on description.
    const existingQuery = supabase
      .from("vyron_customer_item_mappings")
      .select("id")
      .eq("company_id", companyId)
      .limit(1);
    const { data: existing } = code
      ? await existingQuery.eq("source_item_code", code)
      : await existingQuery.ilike("source_description", description);

    const { error } = existing?.length
      ? await supabase.from("vyron_customer_item_mappings").update(payload).eq("id", existing[0].id)
      : await supabase.from("vyron_customer_item_mappings").insert(payload);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, updated: Boolean(existing?.length) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save mapping." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    const companyId = await resolveContext();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });

    const { error } = await supabase
      .from("vyron_customer_item_mappings")
      .delete()
      .eq("company_id", companyId)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete mapping." },
      { status: 400 }
    );
  }
}
