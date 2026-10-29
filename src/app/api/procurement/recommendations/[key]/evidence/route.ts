import { NextRequest, NextResponse } from "next/server";
import { memberDisplayName } from "@/lib/vyron-audit-actor";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { addProcurementEvidence } from "@/lib/vyron-procurement-ai-data";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const TEXT_MAX = 5000;

function decodeKey(rawKey: string) {
  try {
    return decodeURIComponent(String(rawKey || "")).trim();
  } catch {
    return "";
  }
}

function optionalText(value: unknown) {
  if (value === undefined || value === null || value === "") return { ok: true as const, value: undefined };
  if (typeof value !== "string" || value.length > TEXT_MAX) return { ok: false as const };
  return { ok: true as const, value: value.trim() || undefined };
}

/**
 * Add evidence to one procurement recommendation in the signed-in member's own
 * company, with the same permission as its tracking route (purchase_orders
 * .edit). The evidence text is kept exactly as entered; "created by" is the
 * member (it used to be the assigned owner's typed name, or "Procurement
 * Manager", written from the browser with the public key).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500, headers: NO_STORE });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500, headers: NO_STORE });
  try {
    const session = await requireWorkspacePermission("purchase_orders.edit");
    const key = decodeKey((await context.params).key);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const evidenceType = typeof body?.evidenceType === "string" ? body.evidenceType.trim().slice(0, 100) : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content = optionalText(body?.content);
    const documentUrl = optionalText(body?.documentUrl);
    if (!key || !evidenceType || !title || title.length > 500 || !content.ok || !documentUrl.ok) {
      return NextResponse.json({ ok: false, error: "Evidence needs a type and a title." }, { status: 400, headers: NO_STORE });
    }
    const companyId = await requireApiCompanyId();
    try {
      await addProcurementEvidence(
        supabase,
        companyId,
        key,
        { evidenceType, title, content: content.value, documentUrl: documentUrl.value },
        await memberDisplayName(supabase, session)
      );
    } catch (error) {
      if (error instanceof Error && error.message === "Recommendation not found.") {
        return NextResponse.json({ ok: false, error: error.message }, { status: 404, headers: NO_STORE });
      }
      throw error;
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    const response = workspaceAccessErrorResponse(error, "Evidence could not be added.");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
