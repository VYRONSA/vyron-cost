import { NextRequest, NextResponse } from "next/server";
import { searchItemLookup } from "@/lib/platform/item-lookup/searchItemLookup";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, WorkspaceAccessError } from "@/lib/vyron-workspace-access";
import type { ItemLookupSearchParams } from "@/lib/platform/item-lookup/ItemLookupTypes";

export const runtime = "nodejs";

/**
 * Item lookup for the BOM pickers.
 *
 * Four outcomes, each reported distinctly. They used to collapse into one
 * empty list: a caller with no session, a caller without permission, and a
 * caller whose workspace resolved to no company all produced exactly what a
 * search for a nonexistent ingredient produced, so an empty picker gave no
 * clue which had happened. Nothing about the search itself changes here — the
 * same results come back for the same query.
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, items: [], reason: "error", error: "SUPABASE_SERVICE_ROLE_KEY is required." },
      { status: 500 }
    );
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, items: [], reason: "error", error: "Supabase unavailable." },
      { status: 500 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const params: ItemLookupSearchParams = {
    q: searchParams.get("q") || undefined,
    type: (searchParams.get("type") as ItemLookupSearchParams["type"]) || undefined,
    status: (searchParams.get("status") as ItemLookupSearchParams["status"]) || undefined,
    category: searchParams.get("category") || undefined,
    supplierId: searchParams.get("supplierId") || undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  };

  try {
    await requireWorkspacePermission("products.view");
    const companyId = await resolveApiCompanyId();

    if (!companyId) {
      /*
       * Signed in and permitted, but the session resolves to no company. The
       * picker cannot search anything and the operator needs to know that
       * rather than conclude their ingredients are missing. 409, so it is
       * plainly distinct from 401 and 403 in a network log.
       */
      return NextResponse.json(
        {
          ok: false,
          items: [],
          reason: "no_workspace",
          error: "No workspace is active for this session, so nothing can be searched. Sign out and back in, or reopen the workspace.",
        },
        { status: 409 }
      );
    }

    const items = await searchItemLookup(supabase, companyId, params);
    // A real search that simply matched nothing is a success, and says so.
    return NextResponse.json({ ok: true, items, reason: items.length ? "ok" : "empty" });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json(
        {
          ok: false,
          items: [],
          reason: error.status === 401 ? "unauthenticated" : "unauthorized",
          error:
            error.status === 401
              ? "You are not signed in, so items cannot be loaded. Sign in and try again."
              : "Your account does not have permission to view items. Ask an administrator for product access.",
        },
        { status: error.status }
      );
    }
    const message = error instanceof Error ? error.message : "Item lookup search failed.";
    return NextResponse.json({ ok: false, items: [], reason: "error", error: message }, { status: 500 });
  }
}
