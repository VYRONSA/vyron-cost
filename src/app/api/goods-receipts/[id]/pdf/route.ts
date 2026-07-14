import { NextRequest, NextResponse } from "next/server";
import { buildGoodsReceiptPdf } from "@/lib/platform/documents/adapters/goods-receipt";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

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
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("goods_receipts.view");
    const companyId = await resolveApiCompanyIdWithContext(supabase, companyContextFromRequest(request));
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    const result = await buildGoodsReceiptPdf(supabase, companyId, id);
    if (!result) return NextResponse.json({ ok: false, error: "Goods receipt not found." }, { status: 404 });

    return new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.grnNumber || "goods-receipt"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "PDF generation failed.");
  }
}
