import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_APPROVAL_RULES,
  getDocumentApprovalRules,
  upsertDocumentApprovalRules,
} from "@/lib/vyron-document-approval-rules";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  try {
    const companyId = await requireApiCompanyId();
    const rules = await getDocumentApprovalRules(supabase, companyId);
    return NextResponse.json({ ok: true, rules, defaults: DEFAULT_APPROVAL_RULES });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load approval rules.";
    const status = message.includes("active workspace") ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  try {
    const companyId = await requireApiCompanyId();
    const rules = await upsertDocumentApprovalRules(supabase, companyId, body?.rules || body);
    return NextResponse.json({ ok: true, rules, message: "Approval rules saved." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save approval rules." },
      { status: 500 }
    );
  }
}
