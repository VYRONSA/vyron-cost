import { NextRequest, NextResponse } from "next/server";
import { developerApiUnauthorized, requirePlatformSessionFromRequest } from "@/lib/vyron-platform-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isProtectedCompany, protectedReason } from "@/lib/vyron-protected-tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Entity counts shown in the confirmation dialog before anything is deleted. */
const IMPACT_TABLES: Array<{ key: string; table: string; column: string }> = [
  { key: "products", table: "vyron_cost_products", column: "company_id" },
  { key: "suppliers", table: "vyron_cost_suppliers", column: "company_id" },
  { key: "boms", table: "vyron_cost_boms", column: "company_id" },
  { key: "ingredients", table: "vyron_cost_ingredients", column: "company_id" },
  { key: "invoices", table: "vyron_cost_invoice_headers", column: "company_id" },
];

export async function POST(request: NextRequest) {
  try {
    await requirePlatformSessionFromRequest(request, ["PLATFORM_ADMIN"]);
  } catch (error) {
    return developerApiUnauthorized(
      error instanceof Error ? error.message : "Developer authentication required."
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase service role is not configured." }, { status: 503 });
  }

  let body: { workspaceIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const ids = Array.isArray(body.workspaceIds)
    ? body.workspaceIds.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "No workspaces selected." }, { status: 400 });
  }

  const { data: workspaces, error } = await supabase
    .from("vyron_workspaces")
    .select("id, company_id, company_name")
    .in("id", ids);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const impact: Record<string, number> = {
    workspaces: (workspaces || []).length,
    products: 0,
    suppliers: 0,
    boms: 0,
    ingredients: 0,
    invoices: 0,
  };
  const blocked: Array<{ workspaceId: string; companyName: string; reason: string }> = [];
  const companyIds: string[] = [];

  for (const w of workspaces || []) {
    if (isProtectedCompany(w.company_id)) {
      blocked.push({
        workspaceId: String(w.id),
        companyName: String(w.company_name || ""),
        reason: protectedReason(w.company_id) || "Protected tenant",
      });
      continue;
    }
    if (w.company_id) companyIds.push(String(w.company_id));
  }

  if (companyIds.length) {
    for (const t of IMPACT_TABLES) {
      const { count } = await supabase
        .from(t.table)
        .select("id", { count: "exact", head: true })
        .in(t.column, companyIds);
      impact[t.key] = count || 0;
    }
  }

  // Total across every table the reset would clear, not only the headline five.
  let totalRows = 0;
  for (const companyId of companyIds) {
    const { data } = await supabase.rpc("vyron_dev_reset_preview", {
      p_company_id: companyId,
      p_module: "factory",
    });
    for (const row of (data as Array<{ row_count: number }> | null) || []) {
      totalRows += Number(row.row_count) || 0;
    }
  }

  return NextResponse.json({
    ok: true,
    impact: { ...impact, totalRows },
    blocked,
    deletableCount: companyIds.length,
    workspaces: (workspaces || []).map((w) => ({
      id: String(w.id),
      companyName: String(w.company_name || ""),
      protected: isProtectedCompany(w.company_id),
    })),
  });
}
