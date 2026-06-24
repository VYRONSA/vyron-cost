import { NextRequest, NextResponse } from "next/server";
import { appendXeroAuditEvent } from "@/lib/vyron-xero-connection-store";
import { requireXeroWorkspaceContext, xeroContextFromRequest } from "@/lib/vyron-xero-api-context";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { importContactsFromXero } from "@/lib/vyron-xero-import-contacts";
import { isXeroOAuthConfigured } from "@/lib/vyron-xero-integration";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  if (!isXeroOAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Xero OAuth is not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET and XERO_REDIRECT_URI.",
      },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const actor = String(body.actor || "user");

  try {
    await requireWorkspacePermission("xero.sync");
    const { workspaceId, companyId } = await requireXeroWorkspaceContext(xeroContextFromRequest(request, body));

    const result = await importContactsFromXero(supabase, workspaceId, companyId, actor);

    await appendXeroAuditEvent(
      workspaceId,
      {
        event: "contacts_imported",
        actor,
        companyId,
        detail: `Imported ${result.imported + result.updated} contacts from Xero (${result.imported} new, ${result.updated} updated, ${result.skipped} skipped).`,
        metadata: result,
      },
      companyId
    );

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Xero contact import failed.");
  }
}
