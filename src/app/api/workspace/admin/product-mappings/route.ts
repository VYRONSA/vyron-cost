import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { upsertCustomerItemMapping } from "@/lib/vyron-import-persist";
import { requireAdminSession } from "@/lib/vyron-workspace-admin-server";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export const runtime = "nodejs";

/** No session is 401; a session without the permission is 403. */
function adminErrorStatus(error: unknown, fallback = 400) {
  const message = error instanceof Error ? String(error.message || "") : "";
  if (message.includes("Workspace session required")) return 401;
  if (message.includes("Access denied") || message.includes("Admin access required")) return 403;
  return fallback;
}


/**
 * Accounting item code -> VYRON product mappings.
 *
 * Every read and write is scoped to the active company, so a mapping saved for
 * one client never resolves for another. Persisted in the database, so mappings
 * survive logout, redeploy and cold start.
 */
async function resolveContext() {
  await requireAdminSession("admin.imports");
  /*
   * getWorkspaceCompanyId resolves the company from the verified membership and
   * is the only thing that scopes the queries below. The requireActiveWorkspaceId
   * call that used to sit here read the browser's active-client cookie, added
   * nothing, and failed the request whenever that cookie was absent.
   */
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
      { status: adminErrorStatus(error) }
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

    const result = await upsertCustomerItemMapping(supabase, companyId, {
      sourceItemCode: code,
      sourceDescription: description,
      productId,
    });

    return NextResponse.json({ ok: true, updated: result.outcome === "updated" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save mapping." },
      { status: adminErrorStatus(error) }
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
      { status: adminErrorStatus(error) }
    );
  }
}
