import { NextRequest, NextResponse } from "next/server";
import {
  bulkUpdateContactRoles,
  type BulkContactRoleAction,
} from "@/lib/vyron-contact-master";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
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
    const companyId = await requireApiCompanyId();
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
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Bulk contact update failed.");
  }
}
