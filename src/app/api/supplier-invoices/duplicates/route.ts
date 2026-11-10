import { NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { DuplicateResolutionError, listDuplicateSupplierInvoices, resolveDuplicateSupplierInvoice } from "@/lib/vyron-supplier-invoice-duplicates";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { sessionHasPermission } from "@/lib/vyron-workspace-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — supplier invoices captured more than once, grouped, with what may be done to each copy. */
export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const session = await requireWorkspacePermission("suppliers.view");
    const companyId = await requireApiCompanyId();
    const groups = await listDuplicateSupplierInvoices(supabase, companyId);
    return NextResponse.json({ ok: true, groups, canResolve: sessionHasPermission(session, "supplier_invoices.override") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Duplicate supplier invoices could not be loaded.");
  }
}

/** POST { invoiceId, action: "void" | "delete", reason } — supplier_invoices.override. */
export async function POST(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const session = await requireWorkspacePermission("supplier_invoices.override");
    const companyId = await requireApiCompanyId();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await resolveDuplicateSupplierInvoice(supabase, companyId, {
      invoiceId: String(body.invoiceId || ""),
      action: body.action === "delete" ? "delete" : body.action === "void" ? "void" : (String(body.action) as "void"),
      reason: String(body.reason || ""),
      actorName: await memberDisplayName(supabase, session),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DuplicateResolutionError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return workspaceAccessErrorResponse(error, "Duplicate resolution failed.");
  }
}
