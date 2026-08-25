import { NextResponse, type NextRequest } from "next/server";
import { requireStaffScope, staffError } from "@/lib/vyron-order-staff-request";
import { getOrderCentreSummary, listOrderCentreOrders } from "@/lib/vyron-order-centre";

export const runtime = "nodejs";

/** Order Centre list + summary. Server-filtered and paged; tenant from session. */
export async function GET(request: NextRequest) {
  const guard = await requireStaffScope("sales_orders.view");
  if (!guard.ok) return guard.response;
  const p = request.nextUrl.searchParams;
  try {
    const [summary, list] = await Promise.all([
      getOrderCentreSummary(guard.supabase, guard.companyId),
      listOrderCentreOrders(guard.supabase, guard.companyId, {
        status: p.get("status") || undefined,
        search: p.get("search") || undefined,
        customerId: p.get("customerId") || undefined,
        deliveryFrom: p.get("deliveryFrom") || undefined,
        deliveryTo: p.get("deliveryTo") || undefined,
        limit: Number(p.get("limit")) || 25,
        offset: Number(p.get("offset")) || 0,
      }),
    ]);
    return NextResponse.json({ ok: true, summary, ...list });
  } catch {
    return staffError("We couldn't load orders.", 500);
  }
}
