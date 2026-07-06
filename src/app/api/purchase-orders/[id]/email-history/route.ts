import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: poId } = await context.params;

  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.view");

    const companyId = await resolveApiCompanyIdWithContext(supabase, {
      workspaceId: request.nextUrl.searchParams.get("workspaceId"),
      companyId: request.nextUrl.searchParams.get("companyId"),
    });
    if (!companyId) return NextResponse.json({ ok: true, history: [] });

    const { data, error } = await supabase
      .from("vyron_procurement_audit_log")
      .select("id, event_type, detail, actor, metadata, created_at")
      .eq("company_id", companyId)
      .eq("entity_type", "purchase_order")
      .eq("entity_id", poId)
      .in("event_type", ["PO Email Sent", "PO Email Failed"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const history = (data || []).map((row) => {
      const metadata = (row.metadata || {}) as Record<string, unknown>;
      return {
        id: row.id,
        eventType: row.event_type,
        detail: row.detail,
        actor: row.actor,
        status: String(metadata.status || ""),
        recipient: String(metadata.recipient || ""),
        cc: Array.isArray(metadata.cc) ? metadata.cc : [],
        bcc: Array.isArray(metadata.bcc) ? metadata.bcc : [],
        subject: String(metadata.subject || ""),
        sentAt: String(metadata.sent_at || row.created_at || ""),
        messageId: metadata.message_id ? String(metadata.message_id) : null,
        error: metadata.error ? String(metadata.error) : null,
        retryOf: metadata.retry_of ? String(metadata.retry_of) : null,
      };
    });

    return NextResponse.json({ ok: true, history });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load purchase order email history failed.");
  }
}
