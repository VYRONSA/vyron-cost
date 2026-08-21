import { NextRequest, NextResponse } from "next/server";
import {
  deleteSupplierInvoice,
  deleteSupplierInvoiceLine,
  getSupplierInvoice,
  getSupplierInvoiceEditOptions,
  recalcSupplierInvoiceTotals,
  updateSupplierInvoice,
  updateSupplierInvoiceLine,
} from "@/lib/vyron-supplier-invoices";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("suppliers.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    const loaded = await getSupplierInvoice(supabase, companyId, id);
    if (!loaded) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

    const options = await getSupplierInvoiceEditOptions(supabase, companyId);
    return NextResponse.json(
      { ok: true, ...loaded, suppliers: options.suppliers, ingredients: options.ingredients },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load failed.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("suppliers.edit");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    if (body.action === "updateLine") {
      if (!body.lineId) return NextResponse.json({ ok: false, error: "lineId required." }, { status: 400 });
      const invoice = await updateSupplierInvoiceLine(supabase, companyId, id, String(body.lineId), {
        itemName: body.itemName,
        category: body.category,
        quantity: body.quantity,
        unit: body.unit,
        unitCost: body.unitCost,
        expectedUnitCost: body.expectedUnitCost,
        vatRate: body.vatRate,
        ingredientId: body.ingredientId,
      });
      return NextResponse.json({ ok: true, invoice });
    }

    if (body.action === "recalculateTotals") {
      const invoice = await recalcSupplierInvoiceTotals(supabase, companyId, id);
      return NextResponse.json({ ok: true, invoice });
    }

    if (body.action === "deleteLine") {
      if (!body.lineId) return NextResponse.json({ ok: false, error: "lineId required." }, { status: 400 });
      const invoice = await deleteSupplierInvoiceLine(supabase, companyId, id, String(body.lineId));
      return NextResponse.json({ ok: true, invoice });
    }

    const invoice = await updateSupplierInvoice(supabase, companyId, id, {
      supplierId: body.supplierId,
      invoiceNumber: body.invoiceNumber,
      invoiceDate: body.invoiceDate,
      status: body.status,
      notes: body.notes,
      sourceType: body.sourceType,
      matchedPoId: body.matchedPoId,
      duplicateRisk: body.duplicateRisk,
    });
    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update failed.");
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("suppliers.delete");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });
    const result = await deleteSupplierInvoice(supabase, companyId, id);
    return NextResponse.json({ ok: true, deletedLines: result.deletedLines });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete failed.");
  }
}
