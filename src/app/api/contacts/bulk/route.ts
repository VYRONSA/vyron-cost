import { NextRequest, NextResponse } from "next/server";
import {
  bulkUpdateContactRoles,
  type BulkContactRoleAction,
} from "@/lib/vyron-contact-master";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspaceContext } from "@/lib/vyron-api-workspace";
import { resolveContactMasterCompanyId } from "@/lib/vyron-workspace-company-resolution";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

const ACTIONS: BulkContactRoleAction[] = [
  "mark-customer",
  "mark-supplier",
  "mark-both",
  "remove-customer",
  "remove-supplier",
];

function parseAction(value: unknown): BulkContactRoleAction | null {
  if (typeof value === "string" && ACTIONS.includes(value as BulkContactRoleAction)) {
    return value as BulkContactRoleAction;
  }
  return null;
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("customers.edit");
    const { workspace, companyId: resolvedCompanyId } = await requireWorkspaceContext();
    const companyId = await resolveContactMasterCompanyId(
      supabase,
      resolvedCompanyId,
      workspace?.id ?? null
    );

    const action = parseAction(body.action);
    const contactIds = Array.isArray(body.contactIds)
      ? (body.contactIds as string[]).filter((id) => typeof id === "string" && id.trim())
      : [];

    if (!action) {
      return NextResponse.json({ ok: false, error: "Valid action is required." }, { status: 400 });
    }
    if (!contactIds.length) {
      return NextResponse.json({ ok: false, error: "contactIds are required." }, { status: 400 });
    }

    const result = await bulkUpdateContactRoles(supabase, companyId, contactIds, action);
    const errorCount = result.failed;
    const ok = errorCount === 0;

    return NextResponse.json(
      {
        ok,
        companyId,
        requested: contactIds.length,
        errorCount,
        processed: result.processed,
        updated: result.updated,
        failed: result.failed,
        contacts: result.contacts,
        errors: result.errors,
        error:
          errorCount > 0
            ? `Bulk update completed with ${errorCount} failure(s) out of ${result.processed} contact(s).`
            : undefined,
      },
      { status: ok ? 200 : 207 }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Bulk contact update failed.");
  }
}
