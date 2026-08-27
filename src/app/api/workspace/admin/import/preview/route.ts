import { NextRequest, NextResponse } from "next/server";
import { previewCustomerInvoices } from "@/lib/vyron-import-persist";
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
      { status: adminErrorStatus(error) }
    );
  }
}
