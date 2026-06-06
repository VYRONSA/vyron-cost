import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_XERO_ACCOUNT_MAPPING, type XeroAccountMapping } from "@/lib/vyron-xero-integration";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

const memoryStore = new Map<string, XeroAccountMapping>();

async function readMapping(workspaceId: string): Promise<XeroAccountMapping> {
  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from("vyron_xero_workspace_settings")
        .select("account_mapping")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (data?.account_mapping) return { ...DEFAULT_XERO_ACCOUNT_MAPPING, ...(data.account_mapping as XeroAccountMapping) };
    }
  }
  return memoryStore.get(workspaceId) || DEFAULT_XERO_ACCOUNT_MAPPING;
}

async function writeMapping(workspaceId: string, mapping: XeroAccountMapping) {
  memoryStore.set(workspaceId, mapping);
  if (isSupabaseServiceRoleConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from("vyron_xero_workspace_settings").upsert({
        workspace_id: workspaceId,
        account_mapping: mapping,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("clientId") || "default";
  const mapping = await readMapping(workspaceId);
  return NextResponse.json({ ok: true, mapping });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const workspaceId = String(body.clientId || "default");
  const mapping = { ...DEFAULT_XERO_ACCOUNT_MAPPING, ...(body.mapping || {}) } as XeroAccountMapping;
  await writeMapping(workspaceId, mapping);
  return NextResponse.json({ ok: true, mapping });
}
