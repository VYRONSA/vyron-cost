import { NextResponse } from "next/server";
import {
  getSupplierInvoiceEditOptions,
  listSupplierInvoices,
  supplierInvoiceLineCounts,
} from "@/lib/vyron-supplier-invoices";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("suppliers.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json(
        { ok: true, invoices: [], lineCounts: {}, suppliers: [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const invoices = await listSupplierInvoices(supabase, companyId);
    const [lineCounts, options] = await Promise.all([
      supplierInvoiceLineCounts(supabase, invoices.map((invoice) => invoice.id)),
      getSupplierInvoiceEditOptions(supabase, companyId),
    ]);
    return NextResponse.json(
      { ok: true, invoices, lineCounts, suppliers: options.suppliers },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List failed.");
  }
}
