import { NextResponse, type NextRequest } from "next/server";
import { requireStaffScope, staffError } from "@/lib/vyron-order-staff-request";
import {
  listNotificationRecipients,
  saveNotificationRecipient,
  deleteNotificationRecipient,
  sendTestNotification,
  getProviderStatus,
  type RecipientRole,
  type DeliveryChannel,
} from "@/lib/vyron-order-notifications";

export const runtime = "nodejs";

const ROLES: RecipientRole[] = ["Commercial", "Production", "Delivery", "Management"];

/** Recipients plus an honest statement of which channels can actually deliver. */
export async function GET() {
  const guard = await requireStaffScope("sales_orders.view");
  if (!guard.ok) return guard.response;
  try {
    const [recipients, providers] = await Promise.all([
      listNotificationRecipients(guard.supabase, guard.companyId),
      // Reports what each channel can actually do, and when it last really
      // succeeded — never "operational" on the strength of config alone.
      getProviderStatus(guard.supabase, guard.companyId),
    ]);
    return NextResponse.json({ ok: true, recipients, providers });
  } catch {
    return staffError("We couldn't load recipients.", 500);
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireStaffScope("sales_orders.edit");
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => null);
  const role = ROLES.includes(body?.role) ? (body.role as RecipientRole) : "Commercial";
  try {
    const saved = await saveNotificationRecipient(guard.supabase, guard.companyId, {
      id: body?.id ? String(body.id) : null,
      name: String(body?.name || ""),
      role,
      email: body?.email ? String(body.email) : null,
      mobile: body?.mobile ? String(body.mobile) : null,
      emailEnabled: Boolean(body?.emailEnabled),
      smsEnabled: Boolean(body?.smsEnabled),
      whatsappEnabled: Boolean(body?.whatsappEnabled),
      status: body?.status === "Inactive" ? "Inactive" : "Active",
    });
    return NextResponse.json({ ok: true, id: saved.id });
  } catch (error) {
    return staffError(error instanceof Error ? error.message : "We couldn't save that recipient.");
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireStaffScope("sales_orders.edit");
  if (!guard.ok) return guard.response;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return staffError("Choose a recipient.");
  try {
    await deleteNotificationRecipient(guard.supabase, guard.companyId, id);
    return NextResponse.json({ ok: true });
  } catch {
    return staffError("We couldn't remove that recipient.", 500);
  }
}

/** Send a test notification. Creates no order, and reports the real result. */
export async function PUT(request: NextRequest) {
  const guard = await requireStaffScope("sales_orders.edit");
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => null);
  const channel = String(body?.channel || "email") as DeliveryChannel;
  try {
    const result = await sendTestNotification(guard.supabase, guard.companyId, {
      recipientId: String(body?.recipientId || ""),
      channel,
      baseUrl: request.nextUrl.origin,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return staffError(error instanceof Error ? error.message : "We couldn't send that test.");
  }
}
