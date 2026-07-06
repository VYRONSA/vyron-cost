import { NextRequest, NextResponse } from "next/server";
import { deleteProduct, updateProduct } from "@/lib/vyron-cost-master-data";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

function isOptionalSchemaError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || "");
  const message = String((error as { message?: string } | null)?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "42703" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await params;

  try {
    await requireWorkspacePermission("products.view");
    const companyId = await requireApiCompanyId();

    const { data: product, error: productError } = await supabase
      .from("vyron_cost_products")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (productError) throw new Error(productError.message);
    if (!product) return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });

    const linkedBomId = String((product as { linked_bom_id?: string | null }).linked_bom_id || "");
    const bomResponse = linkedBomId
      ? await supabase
          .from("vyron_cost_recipes")
          .select("id, bom_name, recipe_name, cost_per_unit, status")
          .eq("id", linkedBomId)
          .eq("company_id", companyId)
          .maybeSingle()
      : { data: null, error: null };
    if (bomResponse.error && !isOptionalSchemaError(bomResponse.error)) throw new Error(bomResponse.error.message);
    const bom = bomResponse.error ? null : bomResponse.data;

    const inventoryResponse = await supabase
      .from("vyron_cost_stock_items")
      .select("id, qty_on_hand, average_cost, inventory_value, stock_status, last_movement_at")
      .eq("company_id", companyId)
      .eq("entity_type", "finished_goods")
      .eq("entity_id", id)
      .maybeSingle();
    if (inventoryResponse.error && !isOptionalSchemaError(inventoryResponse.error)) {
      throw new Error(inventoryResponse.error.message);
    }
    const inventory = inventoryResponse.error ? null : inventoryResponse.data;

    const productionResponse = await supabase
      .from("vyron_cost_production_runs")
      .select("id, run_number, status, actual_qty, total_production_cost, created_at")
      .eq("company_id", companyId)
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (productionResponse.error && !isOptionalSchemaError(productionResponse.error)) {
      throw new Error(productionResponse.error.message);
    }
    const productionRuns = productionResponse.error ? [] : productionResponse.data || [];

    let invoiceLinesResponse = await supabase
      .from("vyron_customer_invoice_lines")
      .select("invoice_id, quantity, line_total, line_gp")
      .eq("company_id", companyId)
      .eq("product_id", id)
      .limit(100);
    if (invoiceLinesResponse.error && isOptionalSchemaError(invoiceLinesResponse.error)) {
      invoiceLinesResponse = await supabase
        .from("vyron_customer_invoice_lines")
        .select("invoice_id, quantity, line_total, line_gp")
        .eq("product_id", id)
        .limit(100);
    }
    if (invoiceLinesResponse.error && !isOptionalSchemaError(invoiceLinesResponse.error)) {
      throw new Error(invoiceLinesResponse.error.message);
    }
    const invoiceLines = invoiceLinesResponse.error ? [] : invoiceLinesResponse.data || [];

    const invoiceIds = Array.from(
      new Set((invoiceLines || []).map((row) => String((row as { invoice_id?: string | null }).invoice_id || "")).filter(Boolean))
    );

    let invoicesResponse = invoiceIds.length
      ? await supabase
          .from("vyron_customer_invoices")
          .select("id, invoice_number, invoice_date, customer_name, status")
          .eq("company_id", companyId)
          .in("id", invoiceIds)
      : { data: [] as Array<Record<string, unknown>>, error: null as { message?: string; code?: string } | null };
    if (invoicesResponse.error && isOptionalSchemaError(invoicesResponse.error)) {
      invoicesResponse = await supabase
        .from("vyron_customer_invoices")
        .select("id, invoice_number, invoice_date, customer_name, status")
        .in("id", invoiceIds);
    }
    if (invoicesResponse.error && !isOptionalSchemaError(invoicesResponse.error)) {
      throw new Error(invoicesResponse.error.message);
    }
    const invoices = invoicesResponse.error ? [] : invoicesResponse.data || [];

    const invoiceById = new Map((invoices || []).map((row) => [String((row as { id?: string }).id || ""), row]));
    const salesHistory = (invoiceLines || [])
      .map((line) => {
        const invoice = invoiceById.get(String((line as { invoice_id?: string }).invoice_id || ""));
        if (!invoice) return null;
        return {
          invoiceId: String((invoice as { id?: string }).id || ""),
          invoiceNumber: String((invoice as { invoice_number?: string }).invoice_number || "-"),
          invoiceDate: String((invoice as { invoice_date?: string }).invoice_date || ""),
          customerName: String((invoice as { customer_name?: string }).customer_name || "-"),
          status: String((invoice as { status?: string }).status || "Draft"),
          quantity: Number((line as { quantity?: number }).quantity || 0),
          lineTotal: Number((line as { line_total?: number }).line_total || 0),
          lineGp: Number((line as { line_gp?: number }).line_gp || 0),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1))
      .slice(0, 12);

    const aiInsightsResponse = await supabase
      .from("vyron_cost_ai_insights")
      .select("id, priority, title, impact, recommendation, href, created_at")
      .eq("company_id", companyId)
      .eq("status", "active")
      .eq("entity_type", "product")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(8);
    if (aiInsightsResponse.error && !isOptionalSchemaError(aiInsightsResponse.error)) {
      throw new Error(aiInsightsResponse.error.message);
    }
    const aiInsights = aiInsightsResponse.error ? [] : aiInsightsResponse.data || [];

    const productName = String((product as { product_name?: string }).product_name || "").toLowerCase();
    const auditResponse = await supabase
      .from("vyron_inventory_audit_log")
      .select("id, event_type, detail, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (auditResponse.error && !isOptionalSchemaError(auditResponse.error)) {
      throw new Error(auditResponse.error.message);
    }
    const auditRows = auditResponse.error ? [] : auditResponse.data || [];

    const auditHistory = (auditRows || [])
      .filter((row) => {
        const text = `${String((row as { event_type?: string }).event_type || "")} ${String((row as { detail?: string }).detail || "")}`.toLowerCase();
        return productName ? text.includes(productName) : false;
      })
      .slice(0, 10);

    return NextResponse.json({
      ok: true,
      product,
      bom: bom || null,
      inventory: inventory || null,
      productionRuns,
      salesHistory,
      aiInsights,
      auditHistory,
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load product failed.");
  }
}

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
