import type { SupabaseClient } from "@supabase/supabase-js";
import { sendDocumentEmail } from "@/lib/platform/documents/sendDocumentEmail";

/**
 * VYRON ORDER — the notification engine.
 *
 * Its single most important property: it is not part of the order transaction.
 * An order is committed by saveCustomerSalesOrder first, and notifications are
 * generated afterwards. Every function here swallows its own failures, so a
 * dead provider can cost a delivery record but never an order.
 *
 * There is no second order engine and no second state machine. Events are named
 * after the transitions the existing engine already performs; nothing here can
 * move an order.
 *
 * Channels are adapters over one shared transport. Email reuses the platform's
 * sendDocumentEmail. SMS and WhatsApp have no provider in this product yet, so
 * they record "Not Configured" and are never reported as sent.
 */

/* ------------------------------------------------------------------ events */

/**
 * Only events the existing workflow genuinely produces.
 *
 * `new_order` fires when a customer submits. The rest map one-to-one onto
 * transitionCustomerSalesOrder actions, so none of them can describe a state
 * the order engine cannot reach.
 */
export const ORDER_NOTIFICATION_EVENTS = [
  "new_order",
  "order_approved",
  "order_picking",
  "order_packed",
  "order_dispatched",
  "order_cancelled",
] as const;

export type OrderNotificationEvent = (typeof ORDER_NOTIFICATION_EVENTS)[number];

export const EVENT_LABELS: Record<OrderNotificationEvent, string> = {
  new_order: "New order",
  order_approved: "Order approved",
  order_picking: "Order being picked",
  order_packed: "Order packed",
  order_dispatched: "Order dispatched",
  order_cancelled: "Order cancelled",
};

export type RecipientRole = "Commercial" | "Production" | "Delivery" | "Management";

/**
 * Which purpose hears about what.
 *
 * Commercial and Management own the customer relationship, so they hear about
 * arrivals and cancellations. Production hears once an order is theirs to make.
 * Delivery hears only when there is something to move.
 */
const ROLE_EVENTS: Record<RecipientRole, OrderNotificationEvent[]> = {
  Commercial: ["new_order", "order_approved", "order_cancelled"],
  Production: ["order_approved", "order_picking", "order_packed"],
  Delivery: ["order_packed", "order_dispatched"],
  Management: ["new_order", "order_cancelled"],
};

export function roleReceives(role: RecipientRole, event: OrderNotificationEvent) {
  return (ROLE_EVENTS[role] || []).includes(event);
}

/* -------------------------------------------------------------------- types */

export type NotificationRecipient = {
  id: string;
  name: string;
  role: RecipientRole;
  email: string | null;
  mobile: string | null;
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  status: "Active" | "Inactive";
};

export type DeliveryChannel = "email" | "sms" | "whatsapp" | "in_app";
export type DeliveryStatus = "Pending" | "Sent" | "Failed" | "Not Configured";

export type OrderNotificationContext = {
  companyId: string;
  salesOrderId: string;
  orderNumber: string;
  customerName: string;
  total: number;
  itemCount: number;
  requestedDeliveryDate: string | null;
  notes?: string | null;
  tenantName?: string | null;
};

const money = (v: number) =>
  `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDate(iso: string | null) {
  if (!iso) return "Not specified";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-ZA", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
}

/* --------------------------------------------------------------- recipients */

export async function listNotificationRecipients(
  supabase: SupabaseClient,
  companyId: string
): Promise<NotificationRecipient[]> {
  const { data, error } = await supabase
    .from("vyron_order_notification_recipients")
    .select("id, name, role, email, mobile, email_enabled, sms_enabled, whatsapp_enabled, status")
    .eq("company_id", companyId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    role: (r.role as RecipientRole) || "Commercial",
    email: r.email ? String(r.email) : null,
    mobile: r.mobile ? String(r.mobile) : null,
    emailEnabled: Boolean(r.email_enabled),
    smsEnabled: Boolean(r.sms_enabled),
    whatsappEnabled: Boolean(r.whatsapp_enabled),
    status: (r.status as "Active" | "Inactive") || "Active",
  }));
}

export async function saveNotificationRecipient(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    id?: string | null;
    name: string;
    role: RecipientRole;
    email?: string | null;
    mobile?: string | null;
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    whatsappEnabled?: boolean;
    status?: "Active" | "Inactive";
  }
): Promise<{ id: string }> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Enter a name.");
  const email = String(input.email || "").trim() || null;
  const mobile = String(input.mobile || "").trim() || null;
  if (!email && !mobile) throw new Error("Enter an email address or a mobile number.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email address does not look right.");

  const payload = {
    company_id: companyId,
    name,
    role: input.role,
    email,
    mobile,
    email_enabled: input.emailEnabled ?? Boolean(email),
    sms_enabled: input.smsEnabled ?? false,
    whatsapp_enabled: input.whatsappEnabled ?? false,
    status: input.status || "Active",
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    // Scoped to the company so an id from elsewhere cannot be edited.
    const { data, error } = await supabase
      .from("vyron_order_notification_recipients")
      .update(payload)
      .eq("id", input.id)
      .eq("company_id", companyId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Recipient not found.");
    return { id: String(data.id) };
  }

  const { data, error } = await supabase
    .from("vyron_order_notification_recipients")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: String(data.id) };
}

export async function deleteNotificationRecipient(
  supabase: SupabaseClient,
  companyId: string,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("vyron_order_notification_recipients")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

/* ----------------------------------------------------------------- delivery */

/**
 * Claim or reuse a delivery row for one event/recipient/channel.
 *
 * The idempotency key carries the uniqueness, so a retry finds the existing row
 * instead of creating a second one. A row already marked Sent is returned as-is
 * and its channel is skipped — one successful delivery per event, ever.
 */
async function claimDelivery(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    event: OrderNotificationEvent | "test";
    salesOrderId: string | null;
    orderNumber: string | null;
    recipientId: string | null;
    recipientName: string;
    channel: DeliveryChannel;
    target: string | null;
    idempotencyKey: string;
  }
): Promise<{ id: string; alreadySent: boolean; created: boolean } | null> {
  const { data: existing } = await supabase
    .from("vyron_order_notification_deliveries")
    .select("id, status")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existing?.id) {
    /*
     * A row that is Sent is finished — never sent twice. A row that Failed or
     * is Not Configured is deliberately retryable: once a provider is switched
     * on, a retry should reach the recipient it could not reach before.
     */
    return { id: String(existing.id), alreadySent: existing.status === "Sent", created: false };
  }

  const { data, error } = await supabase
    .from("vyron_order_notification_deliveries")
    .insert({
      company_id: input.companyId,
      event_type: input.event,
      sales_order_id: input.salesOrderId,
      order_number: input.orderNumber,
      recipient_id: input.recipientId,
      recipient_name: input.recipientName,
      channel: input.channel,
      target: input.target,
      status: "Pending",
      idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();

  if (error) {
    // A concurrent generator won the unique constraint; reuse its row.
    const { data: raced } = await supabase
      .from("vyron_order_notification_deliveries")
      .select("id, status")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (raced?.id) return { id: String(raced.id), alreadySent: raced.status === "Sent", created: false };
    return null;
  }
  return { id: String(data.id), alreadySent: false, created: true };
}

async function recordResult(
  supabase: SupabaseClient,
  id: string,
  result: { status: DeliveryStatus; provider?: string | null; reference?: string | null; error?: string | null }
) {
  const { data: current } = await supabase
    .from("vyron_order_notification_deliveries")
    .select("attempts")
    .eq("id", id)
    .maybeSingle();
  await supabase
    .from("vyron_order_notification_deliveries")
    .update({
      status: result.status,
      provider: result.provider ?? null,
      provider_reference: result.reference ?? null,
      error: result.error ?? null,
      attempts: Number(current?.attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

/* ----------------------------------------------------------------- channels */

/** Email goes out through the platform transport, never a private one. */
async function deliverEmail(input: {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  documentId: string;
  documentNumber: string;
}) {
  const result = await sendDocumentEmail({
    documentType: "vyron-order-notification",
    documentId: input.documentId,
    documentNumber: input.documentNumber,
    to: input.to,
    subject: input.subject,
    textBody: input.textBody,
    htmlBody: input.htmlBody,
  });
  // provider "none" means the webhook is unset — that is configuration, not a
  // delivery failure, and it is reported as such.
  if (result.provider === "none") {
    return { status: "Not Configured" as DeliveryStatus, provider: "none", reference: null, error: result.error };
  }
  return {
    status: (result.status === "sent" ? "Sent" : "Failed") as DeliveryStatus,
    provider: result.provider,
    reference: result.messageId,
    error: result.error,
  };
}

/**
 * SMS and WhatsApp adapters.
 *
 * There is no provider in this product. These exist so the engine has a shaped
 * seam to plug one into, and they report Not Configured rather than pretending.
 * Nothing here sends anything.
 */
function deliverSms() {
  return {
    status: "Not Configured" as DeliveryStatus,
    provider: "none",
    reference: null,
    error: "No SMS provider is configured for VYRON.",
  };
}

function deliverWhatsApp() {
  return {
    status: "Not Configured" as DeliveryStatus,
    provider: "none",
    reference: null,
    error: "No WhatsApp provider is configured for VYRON.",
  };
}

/* ------------------------------------------------------------- email bodies */

function buildOrderEmail(event: OrderNotificationEvent, ctx: OrderNotificationContext, viewUrl: string) {
  const heading = EVENT_LABELS[event];
  const subject = `${heading} ${ctx.orderNumber} — ${ctx.customerName}`;

  const lines = [
    ["Customer", ctx.customerName],
    ["Order", ctx.orderNumber],
    ["Delivery", formatDate(ctx.requestedDeliveryDate)],
    ["Items", String(ctx.itemCount)],
    ["Total", money(ctx.total)],
  ];

  const textBody = [
    `${heading.toUpperCase()} — VYRON ORDER`,
    ctx.tenantName || "",
    "",
    ...lines.map(([k, v]) => `${k}: ${v}`),
    ctx.notes ? `\nCustomer note: ${ctx.notes}` : "",
    "",
    `View the order: ${viewUrl}`,
  ].filter(Boolean).join("\n");

  /*
   * Inline styles only — email clients strip stylesheets. No cost, GP or margin
   * appears: this reaches whoever staff configure, and the order screen behind
   * the link is where permissioned detail belongs.
   */
  const htmlBody = `
<div style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#0f172a;padding:20px 24px;">
      <div style="font-size:18px;font-weight:800;letter-spacing:0.08em;color:#ffffff;">
        VYRON<span style="color:#60a5fa;">ORDER</span>
      </div>
      ${ctx.tenantName ? `<div style="margin-top:4px;font-size:12px;font-weight:600;color:#94a3b8;">${ctx.tenantName}</div>` : ""}
    </div>
    <div style="padding:24px;">
      <div style="font-size:20px;font-weight:800;color:#0f172a;">${heading}</div>
      <div style="margin-top:4px;font-size:14px;font-weight:600;color:#64748b;">${ctx.customerName}</div>
      <table style="width:100%;margin-top:20px;border-collapse:collapse;">
        ${lines.map(([k, v]) => `
        <tr>
          <td style="padding:8px 0;font-size:13px;font-weight:600;color:#64748b;">${k}</td>
          <td style="padding:8px 0;font-size:14px;font-weight:800;color:#0f172a;text-align:right;">${v}</td>
        </tr>`).join("")}
      </table>
      ${ctx.notes ? `
      <div style="margin-top:16px;padding:12px 14px;background:#f8fafc;border-radius:10px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:0.1em;color:#64748b;text-transform:uppercase;">Customer note</div>
        <div style="margin-top:6px;font-size:14px;font-weight:600;color:#334155;">${ctx.notes}</div>
      </div>` : ""}
      <a href="${viewUrl}" style="display:block;margin-top:24px;padding:14px;background:#0f172a;color:#ffffff;text-align:center;text-decoration:none;border-radius:12px;font-size:13px;font-weight:800;letter-spacing:0.08em;">
        VIEW ORDER
      </a>
      <div style="margin-top:14px;font-size:12px;font-weight:500;color:#94a3b8;text-align:center;">
        You will be asked to sign in to VYRON before the order opens.
      </div>
    </div>
  </div>
</div>`.trim();

  return { subject, textBody, htmlBody };
}

/* ------------------------------------------------------------ the generator */

export type NotificationOutcome = {
  /** Rows newly created by this call. A replay creates none. */
  generated: number;
  /** Existing non-Sent rows attempted again. */
  retried: number;
  sent: number;
  failed: number;
  notConfigured: number;
  /** Already delivered, deliberately left alone. */
  skipped: number;
};

/**
 * Generate and attempt every notification for one order event.
 *
 * Called AFTER the order is committed. It never throws: the caller is a
 * customer waiting for a confirmation screen, and no provider problem is
 * allowed to reach them.
 */
export async function notifyOrderEvent(
  supabase: SupabaseClient,
  event: OrderNotificationEvent,
  ctx: OrderNotificationContext,
  options?: { baseUrl?: string }
): Promise<NotificationOutcome> {
  const outcome: NotificationOutcome = { generated: 0, retried: 0, sent: 0, failed: 0, notConfigured: 0, skipped: 0 };
  const viewUrl = `${(options?.baseUrl || "").replace(/\/$/, "")}/order-centre/${ctx.salesOrderId}`;

  const tally = (status: DeliveryStatus) => {
    if (status === "Sent") outcome.sent += 1;
    else if (status === "Failed") outcome.failed += 1;
    else if (status === "Not Configured") outcome.notConfigured += 1;
  };

  try {
    /*
     * The in-app notification is generated first and depends on nothing
     * external. Even with every provider dead, staff still see the order.
     */
    const inApp = await claimDelivery(supabase, {
      companyId: ctx.companyId,
      event,
      salesOrderId: ctx.salesOrderId,
      orderNumber: ctx.orderNumber,
      recipientId: null,
      recipientName: "VYRON ORDER CENTRE",
      channel: "in_app",
      target: null,
      idempotencyKey: `order:${ctx.salesOrderId}:${event}:workspace:in_app`,
    });
    if (inApp && !inApp.alreadySent) {
      if (inApp.created) outcome.generated += 1; else outcome.retried += 1;
      await recordResult(supabase, inApp.id, { status: "Sent", provider: "in_app" });
      outcome.sent += 1;
    } else if (inApp?.alreadySent) {
      outcome.skipped += 1;
    }

    const recipients = (await listNotificationRecipients(supabase, ctx.companyId))
      .filter((r) => r.status === "Active" && roleReceives(r.role, event));

    const email = buildOrderEmail(event, ctx, viewUrl);

    for (const recipient of recipients) {
      const channels: DeliveryChannel[] = [];
      if (recipient.emailEnabled && recipient.email) channels.push("email");
      if (recipient.smsEnabled && recipient.mobile) channels.push("sms");
      if (recipient.whatsappEnabled && recipient.mobile) channels.push("whatsapp");

      for (const channel of channels) {
        const key = `order:${ctx.salesOrderId}:${event}:${recipient.id}:${channel}`;
        const claim = await claimDelivery(supabase, {
          companyId: ctx.companyId,
          event,
          salesOrderId: ctx.salesOrderId,
          orderNumber: ctx.orderNumber,
          recipientId: recipient.id,
          recipientName: recipient.name,
          channel,
          target: channel === "email" ? recipient.email : recipient.mobile,
          idempotencyKey: key,
        });
        if (!claim) continue;
        if (claim.alreadySent) { outcome.skipped += 1; continue; }
        if (claim.created) outcome.generated += 1; else outcome.retried += 1;

        const result =
          channel === "email"
            ? await deliverEmail({
                to: recipient.email as string,
                subject: email.subject,
                textBody: email.textBody,
                htmlBody: email.htmlBody,
                documentId: ctx.salesOrderId,
                documentNumber: ctx.orderNumber,
              })
            : channel === "sms"
              ? deliverSms()
              : deliverWhatsApp();

        await recordResult(supabase, claim.id, result);
        tally(result.status);
      }
    }
  } catch {
    // Notifications are never allowed to surface as an ordering failure.
  }

  return outcome;
}

/* ------------------------------------------------------------ test sending */

/** A test notification. Creates no order and is clearly labelled as a test. */
export async function sendTestNotification(
  supabase: SupabaseClient,
  companyId: string,
  input: { recipientId: string; channel: DeliveryChannel; baseUrl?: string }
): Promise<{ status: DeliveryStatus; provider: string | null; error: string | null }> {
  const recipients = await listNotificationRecipients(supabase, companyId);
  const recipient = recipients.find((r) => r.id === input.recipientId);
  if (!recipient) throw new Error("Recipient not found.");

  const target = input.channel === "email" ? recipient.email : recipient.mobile;
  if (!target) throw new Error(`That recipient has no ${input.channel === "email" ? "email address" : "mobile number"}.`);

  // A fresh key every time: a test is meant to be repeatable.
  const key = `test:${companyId}:${recipient.id}:${input.channel}:${Date.now()}`;
  const claim = await claimDelivery(supabase, {
    companyId,
    event: "test",
    salesOrderId: null,
    orderNumber: null,
    recipientId: recipient.id,
    recipientName: recipient.name,
    channel: input.channel,
    target,
    idempotencyKey: key,
  });
  if (!claim) throw new Error("Could not record the test notification.");

  let result: { status: DeliveryStatus; provider: string | null; reference: string | null; error: string | null };
  if (input.channel === "email") {
    result = await deliverEmail({
      to: target,
      subject: "VYRON ORDER test notification",
      textBody:
        "This is a VYRON ORDER test notification.\n\nNo order was created. If you received this, order notifications will reach you at this address.",
      htmlBody: `
<div style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#0f172a;padding:20px 24px;font-size:18px;font-weight:800;letter-spacing:0.08em;color:#ffffff;">
      VYRON<span style="color:#60a5fa;">ORDER</span>
    </div>
    <div style="padding:24px;">
      <div style="font-size:20px;font-weight:800;color:#0f172a;">This is a test notification</div>
      <div style="margin-top:8px;font-size:14px;font-weight:600;color:#475569;">
        No order was created. If this reached you, order notifications will reach you at this address.
      </div>
    </div>
  </div>
</div>`.trim(),
      documentId: "test",
      documentNumber: "TEST",
    });
  } else if (input.channel === "sms") {
    result = deliverSms();
  } else if (input.channel === "whatsapp") {
    result = deliverWhatsApp();
  } else {
    result = { status: "Sent", provider: "in_app", reference: null, error: null };
  }

  await recordResult(supabase, claim.id, result);
  return { status: result.status, provider: result.provider, error: result.error };
}

/* ------------------------------------------------------ the staff bell feed */

export type InAppNotification = {
  id: string;
  event: string;
  eventLabel: string;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  total: number | null;
  createdAt: string;
  read: boolean;
};

/** Unread first, newest first, capped — the bell never loads a whole history. */
export async function listInAppNotifications(
  supabase: SupabaseClient,
  companyId: string,
  options?: { limit?: number; includeRead?: boolean }
): Promise<{ items: InAppNotification[]; unreadCount: number }> {
  const limit = Math.min(Math.max(options?.limit || 20, 1), 50);

  let query = supabase
    .from("vyron_order_notification_deliveries")
    .select("id, event_type, sales_order_id, order_number, read_at, created_at")
    .eq("company_id", companyId)
    .eq("channel", "in_app")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!options?.includeRead) query = query.is("read_at", null);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data || [];
  const orderIds = [...new Set(rows.map((r) => r.sales_order_id).filter(Boolean))] as string[];

  // One extra read for the customer names and totals the bell shows.
  const orders = new Map<string, { customer_name: string; total: number }>();
  if (orderIds.length) {
    const { data: orderRows } = await supabase
      .from("vyron_customer_sales_orders")
      .select("id, customer_name, total")
      .eq("company_id", companyId)
      .in("id", orderIds);
    for (const o of orderRows || []) {
      orders.set(String(o.id), { customer_name: String(o.customer_name || ""), total: Number(o.total || 0) });
    }
  }

  const { count } = await supabase
    .from("vyron_order_notification_deliveries")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("channel", "in_app")
    .is("read_at", null);

  return {
    items: rows.map((r) => {
      const order = r.sales_order_id ? orders.get(String(r.sales_order_id)) : null;
      return {
        id: String(r.id),
        event: String(r.event_type),
        eventLabel: EVENT_LABELS[r.event_type as OrderNotificationEvent] || String(r.event_type),
        orderId: r.sales_order_id ? String(r.sales_order_id) : null,
        orderNumber: r.order_number ? String(r.order_number) : null,
        customerName: order?.customer_name || null,
        total: order ? order.total : null,
        createdAt: String(r.created_at),
        read: Boolean(r.read_at),
      };
    }),
    unreadCount: count || 0,
  };
}

export async function markNotificationsRead(
  supabase: SupabaseClient,
  companyId: string,
  ids?: string[]
): Promise<void> {
  let query = supabase
    .from("vyron_order_notification_deliveries")
    .update({ read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("channel", "in_app")
    .is("read_at", null);
  if (ids && ids.length) query = query.in("id", ids);
  await query;
}

/* ------------------------------------------------------------ delivery log */

export async function listDeliveryLog(
  supabase: SupabaseClient,
  companyId: string,
  options?: { limit?: number; salesOrderId?: string }
) {
  let query = supabase
    .from("vyron_order_notification_deliveries")
    .select("id, event_type, order_number, sales_order_id, recipient_name, channel, target, status, provider, provider_reference, error, attempts, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options?.limit || 50, 1), 200));
  if (options?.salesOrderId) query = query.eq("sales_order_id", options.salesOrderId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

/** Whether an email provider is configured, for honest status on the settings screen. */
export function emailProviderStatus(): { configured: boolean; detail: string } {
  const configured = Boolean(String(process.env.VYRON_EMAIL_WEBHOOK_URL || "").trim());
  return {
    configured,
    detail: configured
      ? "Email is configured and notifications will be sent."
      : "VYRON_EMAIL_WEBHOOK_URL is not set, so email notifications will be recorded as Not Configured.",
  };
}
