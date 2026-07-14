import { NextRequest, NextResponse } from "next/server";
import { buildSalesOrderPdf } from "@/lib/platform/documents/adapters/sales-order";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

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
    await requireWorkspacePermission("sales_orders.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    const result = await buildSalesOrderPdf(supabase, companyId, id);
    if (!result) return NextResponse.json({ ok: false, error: "Sales order not found." }, { status: 404 });

    return new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.orderNumber || "sales-order"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "PDF generation failed.");
  }
}
