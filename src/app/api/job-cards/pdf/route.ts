import { NextRequest, NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { resolveDocumentBranding } from "@/lib/platform/documents/resolveDocumentBranding";
import { renderJobCardsPdf } from "@/lib/platform/documents/job-card-pdf";
import { buildJobCardDocuments, JobCardError, recordJobCardsPrinted, type JobCardSourceType } from "@/lib/vyron-job-cards";

export const runtime = "nodejs";

const VIEW_PERMISSION: Record<JobCardSourceType, string> = {
  customer_sales_order: "sales_orders.view",
  store_order: "store_orders.view",
};

/**
 * GET /api/job-cards/pdf?type=customer_sales_order&ids=<id>[,<id>...]
 *
 * One PDF, one job card per eligible order (each starting on its own page).
 * The orders are only read. A card is created and numbered the first time an
 * order's job card is printed; reprints reuse it.
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const type = (request.nextUrl.searchParams.get("type") || "customer_sales_order") as JobCardSourceType;
  if (!(type in VIEW_PERMISSION)) return NextResponse.json({ ok: false, error: "Unknown order type." }, { status: 400 });
  const ids = (request.nextUrl.searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const session = await requireWorkspacePermission(VIEW_PERMISSION[type]);
    const companyId = await requireApiCompanyId();
    const actor = await memberDisplayName(supabase, session);
    const { documents, skipped } = await buildJobCardDocuments(supabase, companyId, type, ids, actor);
    if (!documents.length) {
      return NextResponse.json(
        { ok: false, error: skipped.map((s) => s.reason).join(" ") || "No eligible orders.", skipped },
        { status: 409 }
      );
    }
    const branding = await resolveDocumentBranding(companyId);
    const bytes = renderJobCardsPdf(documents, branding, actor);
    await recordJobCardsPrinted(supabase, companyId, documents.map((d) => d.card), actor);
    const name = documents.length === 1 ? `${documents[0].card.jobCardNumber}-${documents[0].orderNumber}` : `job-cards-${documents.length}`;
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}.pdf"`,
        "Cache-Control": "no-store",
        ...(skipped.length ? { "X-Job-Cards-Skipped": String(skipped.length) } : {}),
      },
    });
  } catch (error) {
    if (error instanceof JobCardError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return workspaceAccessErrorResponse(error, "Job card could not be produced.");
  }
}
