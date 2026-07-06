import { NextRequest, NextResponse } from "next/server";
import { getPurchaseOrderDetail } from "@/lib/vyron-procurement";
import { buildPurchaseOrderPdf } from "@/lib/vyron-purchase-order-pdf";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function companyContextFromRequest(request: NextRequest) {
  return {
    workspaceId: request.nextUrl.searchParams.get("workspaceId"),
    companyId: request.nextUrl.searchParams.get("companyId"),
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  }

  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.view");

    const companyId = await resolveApiCompanyIdWithContext(supabase, companyContextFromRequest(request));
    if (!companyId) {
      return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });
    }

    const po = await getPurchaseOrderDetail(supabase, id, companyId);
    if (!po) return NextResponse.json({ ok: false, error: "Purchase order not found." }, { status: 404 });

    const [{ data: company }, { data: supplier }] = await Promise.all([
      supabase.from("vyron_cost_companies").select("*").eq("id", companyId).maybeSingle(),
      po.supplier_id
        ? supabase.from("vyron_cost_suppliers").select("*").eq("id", po.supplier_id).eq("company_id", companyId).maybeSingle()
        : Promise.resolve({ data: null as Record<string, unknown> | null }),
    ]);

    const companyName = String(
      company?.trading_name || company?.company_name || company?.name || company?.legal_name || "VYRON COST"
    );
    const companyAddress = [
      company?.address_line1,
      company?.address_line2,
      company?.city,
      company?.province,
      company?.postal_code,
      company?.country,
    ]
      .filter(Boolean)
      .join(", ");

    const lineDiscountEstimate = Math.max(0, Number(po.expected_total || 0) - Number(po.total || 0));

    const bytes = buildPurchaseOrderPdf({
      company: {
        name: companyName,
        tradingName: String(company?.trading_name || companyName),
        vatNumber: company?.vat_number ? String(company.vat_number) : null,
        email: company?.contact_email ? String(company.contact_email) : null,
        phone: company?.contact_phone ? String(company.contact_phone) : null,
        address: companyAddress || null,
      },
      supplier: {
        name: String(po.supplier_name_snapshot || supplier?.supplier_name || "Supplier"),
        email: supplier?.contact_email ? String(supplier.contact_email) : supplier?.invoice_email ? String(supplier.invoice_email) : null,
        phone: supplier?.phone ? String(supplier.phone) : null,
      },
      po: {
        poNumber: String(po.po_number),
        status: String(po.status),
        requiredDate: po.order_date ? String(po.order_date) : null,
        expectedDelivery: (po.lines || []).find((line) => line.expected_delivery_date)?.expected_delivery_date || null,
        notes: po.notes ? String(po.notes) : null,
        terms: null,
        subtotal: Number(po.subtotal || 0),
        vatAmount: Number(po.vat_amount || 0),
        discountTotal: lineDiscountEstimate,
        total: Number(po.total || 0),
        currency: "ZAR",
        lineItems: (po.lines || []).map((line) => ({
          itemName: String(line.item_name),
          unit: String(line.unit),
          quantity: Number(line.quantity || 0),
          unitPrice: Number(line.unit_price || 0),
          vatRate: Number(line.vat_rate || 0),
          vatAmount: Number(line.vat_amount || 0),
          lineTotal: Number(line.line_total || 0),
        })),
      },
    });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${String(po.po_number || "purchase-order")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "PDF generation failed.");
  }
}
