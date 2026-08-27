import { NextResponse } from "next/server";
import { getContactStatistics, migrateExistingContactsToMaster } from "@/lib/vyron-contact-master";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { ensureWorkspaceCompanyDataAligned } from "@/lib/vyron-workspace-company-resolution";
import { authorisedWorkspaceId, getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function POST() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  }

  try {
    await requireWorkspacePermission("customers.edit");
    const companyId = await requireApiCompanyId();

    /*
     * ensureWorkspaceCompanyDataAligned moves every company-scoped row from the
     * id it is handed onto the caller's company. It was handed the active-client
     * cookie, which the browser writes and nothing validates — so a workspace
     * with no contacts of its own could name another tenant's company id in that
     * cookie and pull their contact master across into itself.
     *
     * The workspace now comes from the verified membership, and the cookie is
     * only allowed to agree with it.
     */
    const authorisedId = await authorisedWorkspaceId();
    const cookieClient = await getServerActiveWorkspace();
    const client = authorisedId && cookieClient?.id === authorisedId ? cookieClient : null;
    const alignment = authorisedId
      ? await ensureWorkspaceCompanyDataAligned(supabase, client ?? { id: authorisedId } as never, companyId)
      : { realigned: false, movedTables: [] as string[], reason: "No verified workspace." };
    const result = await migrateExistingContactsToMaster(supabase, companyId);
    const stats = await getContactStatistics(supabase, companyId);
    return NextResponse.json({ ok: true, ...result, stats, alignment });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Contact migration failed.");
  }
}
