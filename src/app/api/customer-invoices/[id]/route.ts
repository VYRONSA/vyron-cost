import { setCustomerInvoiceBranch } from "@/lib/vyron-customer-invoices";
import { BranchNotSelectableError } from "@/lib/vyron-customer-branches";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteCustomerInvoice,
  getCustomerInvoice,
  updateCustomerInvoiceStatus,
} from "@/lib/vyron-customer-invoices";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("invoices.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });
    const loaded = await getCustomerInvoice(supabase, id, companyId);
    if (!loaded) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true, ...loaded });
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
    /*
     * Authenticate before resolving the tenant. Resolving first answered an
     * unauthenticated PATCH with 400 "No active workspace company", which reads
     * as a configuration problem rather than a refusal — the caller was never
     * signed in. Nothing was ever mutated either way; this is the correct answer,
     * not a new gate.
     */
    await requireWorkspacePermission("invoices.view");

    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    if (body.branchId !== undefined || body.branch_id !== undefined) {
      // Changing where a draft is billed. Refused once the invoice is issued.
      const invoice = await setCustomerInvoiceBranch(
        supabase,
        companyId,
        id,
        body.branchId ?? body.branch_id ?? null
      );
      return NextResponse.json({ ok: true, invoice });
    }

    if (body.action === "approve") {
      await requireWorkspacePermission("invoices.reverse");
      const invoice = await updateCustomerInvoiceStatus(supabase, id, "Approved", companyId);
      return NextResponse.json({ ok: true, invoice });
    }
    if (body.action === "send" || body.action === "email") {
      await requireWorkspacePermission("invoices.email");
      const invoice = await updateCustomerInvoiceStatus(supabase, id, "Sent", companyId);
      return NextResponse.json({ ok: true, invoice });
    }
    if (body.action === "paid") {
      await requireWorkspacePermission("invoices.create");
      const invoice = await updateCustomerInvoiceStatus(supabase, id, "Paid", companyId);
      return NextResponse.json({ ok: true, invoice });
    }
    if (body.action === "cancel") {
      await requireWorkspacePermission("invoices.create");
      const invoice = await updateCustomerInvoiceStatus(supabase, id, "Cancelled", companyId);
      return NextResponse.json({ ok: true, invoice });
    }
    if (body.status) {
      await requireWorkspacePermission("invoices.create");
      const invoice = await updateCustomerInvoiceStatus(supabase, id, body.status, companyId);
      return NextResponse.json({ ok: true, invoice });
    }
    if (body.action === "whatsapp" || body.action === "signature") {
      await requireWorkspacePermission("invoices.create");
      const loaded = await getCustomerInvoice(supabase, id, companyId);
      if (!loaded?.invoice) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

      const now = new Date().toISOString();
      const currentNotes = String(loaded.invoice.notes || "").trim();
      let marker = "";
      if (body.action === "whatsapp") marker = `[WhatsApp sent ${now}]`;
      if (body.action === "signature") {
        const signer = String(body.signer || "operator");
        marker = `[Signature captured by ${signer} at ${now}]`;
      }

      const mergedNotes = [currentNotes, marker].filter(Boolean).join(" \n");
      const { data, error } = await supabase
        .from("vyron_customer_invoices")
        .update({ notes: mergedNotes, updated_at: now })
        .eq("id", id)
        .eq("company_id", companyId)
        .select("*")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, invoice: data });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (error instanceof BranchNotSelectableError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
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
    await requireWorkspacePermission("invoices.reverse");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });
    await deleteCustomerInvoice(supabase, companyId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete failed.");
  }
}
