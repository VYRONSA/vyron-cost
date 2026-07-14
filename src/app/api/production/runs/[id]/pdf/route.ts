import { NextRequest, NextResponse } from "next/server";
import { buildProductionRunPdf } from "@/lib/platform/documents/adapters/production-run";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { manufacturingCompanyContextFromRequest, requireManufacturingCompanyId } from "@/lib/vyron-manufacturing-api-context";
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
    await requireWorkspacePermission("manufacturing.view");
    const companyId = await requireManufacturingCompanyId(supabase, manufacturingCompanyContextFromRequest(request));

    const result = await buildProductionRunPdf(supabase, companyId, id);
    if (!result) return NextResponse.json({ ok: false, error: "Production run not found." }, { status: 404 });

    return new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.runNumber || "production-run"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "PDF generation failed.");
  }
}
