import { NextRequest, NextResponse } from "next/server";
import { previewCustomerInvoices } from "@/lib/vyron-import-persist";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireActiveWorkspaceId, requireAdminSession } from "@/lib/vyron-workspace-admin-server";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";

export const runtime = "nodejs";

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
    await requireActiveWorkspaceId();
    const companyId = await getWorkspaceCompanyId();
    if (!companyId) {
      return NextResponse.json({ ok: false, error: "No active company." }, { status: 400 });
    }

    const body = (await request.json()) as { entity?: string; rows?: Record<string, string>[] };
    if (!Array.isArray(body.rows) || !body.rows.length) {
      return NextResponse.json({ ok: false, error: "rows are required." }, { status: 400 });
    }
    if (body.entity !== "customer-invoices") {
      return NextResponse.json(
        { ok: false, error: "Preview is available for customer-invoices." },
        { status: 400 }
      );
    }

    const preview = await previewCustomerInvoices(supabase, companyId, body.rows);
    return NextResponse.json({ ok: true, entity: body.entity, preview });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Preview failed." },
      { status: 400 }
    );
  }
}
