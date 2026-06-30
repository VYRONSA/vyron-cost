import { NextResponse } from "next/server";
import { validateOpsScan, type OpsScanContext, type OpsScanWorkflow } from "@/lib/vyron-ops-scan-validation";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("inventory.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) {
      return NextResponse.json({ ok: false, error: "No active company." }, { status: 400 });
    }

    const body = (await request.json()) as {
      barcode?: string;
      workflow?: OpsScanWorkflow;
      context?: OpsScanContext;
    };

    if (!body.barcode || !body.workflow) {
      return NextResponse.json({ ok: false, error: "barcode and workflow are required." }, { status: 400 });
    }

    const result = await validateOpsScan(supabase, companyId, {
      barcode: body.barcode,
      workflow: body.workflow,
      context: body.context,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Scan validation failed.");
  }
}
