import { NextRequest, NextResponse } from "next/server";
import { getPoApprovalRules, savePoApprovalRules } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  const rules = await getPoApprovalRules(supabase, VYRON_DEFAULT_TENANT_ID);
  return NextResponse.json({ ok: true, rules });
}

export async function PUT(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  try {
    await savePoApprovalRules(supabase, VYRON_DEFAULT_TENANT_ID, {
      autoApproveBelow: Number(body.autoApproveBelow ?? 5000),
      supervisorApproveBelow: Number(body.supervisorApproveBelow ?? 25000),
      requirePoBeforeInvoiceApproval: Boolean(body.requirePoBeforeInvoiceApproval ?? true),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Save failed." }, { status: 500 });
  }
}
