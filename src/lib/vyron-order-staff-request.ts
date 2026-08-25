import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import { requireWorkspacePermission } from "@/lib/vyron-workspace-access";

/**
 * Staff-side scope for every VYRON ORDER staff API.
 *
 * The company comes from the existing workspace resolution and the permission
 * from the existing permission gate — there is no company input on any staff
 * handler, so a request cannot be pointed at another tenant.
 */
export async function requireStaffScope(permission: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Unavailable." }, { status: 503 }) };
  }
  try {
    await requireWorkspacePermission(permission);
  } catch {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 }) };
  }
  const companyId = await getWorkspaceCompanyId();
  if (!companyId) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "No workspace in context." }, { status: 401 }) };
  }
  return { ok: true as const, supabase, companyId };
}

export function staffError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
