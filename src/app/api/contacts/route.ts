import { NextRequest, NextResponse } from "next/server";
import { listVyronContacts, type ContactFilter } from "@/lib/vyron-contact-master";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

function parseFilter(value: string | null): ContactFilter {
  if (value === "customer" || value === "supplier" || value === "both") return value;
  return "all";
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  try {
    await requireWorkspacePermission("customers.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, contacts: [] });

    const filter = parseFilter(request.nextUrl.searchParams.get("filter"));
    const contacts = await listVyronContacts(supabase, companyId, filter);
    return NextResponse.json({ ok: true, contacts, filter });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Contact list failed.");
  }
}
