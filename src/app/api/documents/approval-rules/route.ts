import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_APPROVAL_RULES,
  getDocumentApprovalRules,
  upsertDocumentApprovalRules,
} from "@/lib/vyron-document-approval-rules";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  try {
    const rules = await getDocumentApprovalRules(supabase, VYRON_DEFAULT_TENANT_ID);
    return NextResponse.json({ ok: true, rules, defaults: DEFAULT_APPROVAL_RULES });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load approval rules." },
      { status: 500 }
    );
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
    const rules = await upsertDocumentApprovalRules(supabase, VYRON_DEFAULT_TENANT_ID, body?.rules || body);
    return NextResponse.json({ ok: true, rules, message: "Approval rules saved." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save approval rules." },
      { status: 500 }
    );
  }
}
