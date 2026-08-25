import { NextResponse, type NextRequest } from "next/server";
import { requireStaffScope, staffError } from "@/lib/vyron-order-staff-request";
import { listInAppNotifications, markNotificationsRead } from "@/lib/vyron-order-notifications";

export const runtime = "nodejs";

/** The staff notification bell. Capped and tenant scoped; never a full history. */
export async function GET(request: NextRequest) {
  const guard = await requireStaffScope("sales_orders.view");
  if (!guard.ok) return guard.response;
  const includeRead = request.nextUrl.searchParams.get("includeRead") === "1";
  try {
    const feed = await listInAppNotifications(guard.supabase, guard.companyId, { includeRead, limit: 20 });
    return NextResponse.json({ ok: true, ...feed });
  } catch {
    return staffError("We couldn't load notifications.", 500);
  }
}

/** Mark notifications read. Without ids, marks everything unread in this tenant. */
export async function POST(request: NextRequest) {
  const guard = await requireStaffScope("sales_orders.view");
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map((i: unknown) => String(i)) : undefined;
  try {
    await markNotificationsRead(guard.supabase, guard.companyId, ids);
    return NextResponse.json({ ok: true });
  } catch {
    return staffError("We couldn't update notifications.", 500);
  }
}
