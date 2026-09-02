import { NextRequest, NextResponse } from "next/server";
import { previewCustomerInvoices } from "@/lib/vyron-import-persist";
import {
  buildCustomerImportPlan,
  loadCompanyCustomers,
  type CustomerImportRow,
  type ExistingBranch,
} from "@/lib/vyron-customer-merge";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
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
 * Dry run for accounting imports. Resolves customers and products exactly as the
 * real import does and writes nothing, so the operator can review before
 * committing. Only entities where a silent partial import would corrupt
 * accounting figures are supported here.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  try {
    await requireAdminSession("admin.imports");
    /*
     * Scoping is getWorkspaceCompanyId, which resolves the company from the
     * verified membership. The requireActiveWorkspaceId call that used to sit
     * here read the browser's active-client cookie, contributed nothing to that
     * answer, and failed the request outright whenever the cookie was missing.
     */
    const companyId = await getWorkspaceCompanyId();
    if (!companyId) {
      return NextResponse.json({ ok: false, error: "No active company." }, { status: 400 });
    }

    const body = (await request.json()) as { entity?: string; rows?: Record<string, string>[] };
    if (!Array.isArray(body.rows) || !body.rows.length) {
      return NextResponse.json({ ok: false, error: "rows are required." }, { status: 400 });
    }
    if (body.entity === "customers") {
      /*
       * What the import would do to the customer book, before it does any of
       * it. The operator sees which customers are new, which will gain
       * information, which are untouched, which disagree with the file, and
       * which could not be identified safely — with the exact fields listed
       * for each — and the confirm step then carries out this same plan.
       */
      const existing = await loadCompanyCustomers(supabase, companyId);
      const mapped: CustomerImportRow[] = body.rows.map((row) => ({
        customer_name: row.customer_name || row.name || "",
        trading_name: row.trading_name,
        registration_number: row.registration_number || row.reg_number,
        vat_number: row.vat_number,
        email: row.contact_email || row.email,
        invoice_email: row.invoice_email,
        phone: row.phone || row.telephone,
        billing_address: row.billing_address || row.address,
        delivery_address: row.delivery_address,
        contact_person: row.contact_person,
        website: row.website,
        category: row.category,
        terms: row.terms,
        xero_contact_id: row.xero_contact_id,
        branch_code: row.branch_code,
        branch_name: row.branch_name,
        branch_address_line1: row.branch_address_line1 || row.branch_address,
        branch_address_line2: row.branch_address_line2,
        branch_suburb: row.branch_suburb,
        branch_city: row.branch_city,
        branch_province: row.branch_province,
        branch_postal_code: row.branch_postal_code,
        branch_country: row.branch_country,
        branch_contact_person: row.branch_contact_person || row.branch_contact,
        branch_phone: row.branch_phone || row.branch_telephone,
        branch_email: row.branch_email,
      }));
      const { data: branchRows } = await supabase
        .from("vyron_customer_branches")
        .select(
          "id, customer_id, branch_code, branch_name, address_line1, address_line2, suburb, city, province, postal_code, country, contact_person, phone, email"
        )
        .eq("company_id", companyId)
        .limit(20000);
      const branchesByCustomer = new Map<string, ExistingBranch[]>();
      for (const row of (branchRows || []) as unknown as (ExistingBranch & { customer_id: string })[]) {
        const list = branchesByCustomer.get(row.customer_id) || [];
        list.push(row);
        branchesByCustomer.set(row.customer_id, list);
      }
      const plan = buildCustomerImportPlan(existing, mapped, branchesByCustomer);
      return NextResponse.json({ ok: true, entity: body.entity, plan });
    }

    if (body.entity !== "customer-invoices") {
      return NextResponse.json(
        { ok: false, error: "Preview is available for customers and customer-invoices." },
        { status: 400 }
      );
    }

    const preview = await previewCustomerInvoices(supabase, companyId, body.rows);
    return NextResponse.json({ ok: true, entity: body.entity, preview });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Preview failed." },
      { status: adminErrorStatus(error) }
    );
  }
}
