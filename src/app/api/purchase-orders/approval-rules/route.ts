import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_PO_APPROVAL_RULES,
  getPoApprovalRules,
  savePoApprovalRules,
} from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return jsonNoStore({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return jsonNoStore({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("purchase_orders.view");
    const companyId = await resolveApiCompanyIdWithContext(supabase, {
      workspaceId: request.nextUrl.searchParams.get("workspaceId"),
      companyId: request.nextUrl.searchParams.get("companyId"),
    });
    if (!companyId) {
      return jsonNoStore({ ok: false, error: "No active workspace company." }, { status: 400 });
    }
    const rules = await getPoApprovalRules(supabase, companyId);
    return jsonNoStore({ ok: true, rules, defaults: DEFAULT_PO_APPROVAL_RULES, companyId });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load failed.");
  }
}

export async function PUT(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return jsonNoStore({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return jsonNoStore({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  try {
    await requireWorkspacePermission("purchase_orders.edit");
    const companyId = await resolveApiCompanyIdWithContext(supabase, {
      workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : null,
      companyId: typeof body.companyId === "string" ? body.companyId : null,
    });
    if (!companyId) {
      return jsonNoStore({ ok: false, error: "No active workspace company." }, { status: 400 });
    }
    const autoApproveBelow = Number(body.autoApproveBelow);
    const supervisorApproveBelow = Number(body.supervisorApproveBelow);
    if (!Number.isFinite(autoApproveBelow) || !Number.isFinite(supervisorApproveBelow)) {
      return jsonNoStore({ ok: false, error: "Invalid threshold values." }, { status: 400 });
    }
    const rules = await savePoApprovalRules(supabase, companyId, {
      autoApproveBelow,
      supervisorApproveBelow,
      requirePoBeforeInvoiceApproval: Boolean(body.requirePoBeforeInvoiceApproval),
    });
    return jsonNoStore({ ok: true, rules, message: "Settings saved.", companyId });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Save failed.");
  }
}
