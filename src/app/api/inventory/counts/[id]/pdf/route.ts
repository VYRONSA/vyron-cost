import { NextRequest, NextResponse } from "next/server";
import { buildStockCountPdf } from "@/lib/platform/documents/adapters/stock-count";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { inventoryCompanyContextFromRequest, requireInventoryCompanyId } from "@/lib/vyron-inventory-api-context";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("inventory.view");
    const companyId = await requireInventoryCompanyId(supabase, inventoryCompanyContextFromRequest(request));

    const result = await buildStockCountPdf(supabase, companyId, id);
    if (!result) return NextResponse.json({ ok: false, error: "Stock count not found." }, { status: 404 });

    return new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.countNumber || "stock-count"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "PDF generation failed.");
  }
}
