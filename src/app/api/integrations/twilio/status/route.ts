import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { deliveryStatusFromTwilio, twilioStatusCallbackUrl, validTwilioSignature } from "@/lib/vyron-twilio-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — Twilio message status callback (form-encoded). Public, but only a request carrying a valid
 * X-Twilio-Signature for this account is acted on. Updates the notification delivery whose
 * provider reference is the MessageSid: Sent → Delivered, or Sent/Delivered → Failed with Twilio's
 * error code. Nothing is ever marked delivered without Twilio saying so.
 */
export async function POST(request: Request) {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const url = twilioStatusCallbackUrl();
  if (!authToken || !url) return NextResponse.json({ ok: false, error: "Twilio status callbacks are not configured." }, { status: 503 });

  const params: Record<string, string> = {};
  try {
    const form = await request.formData();
    for (const [key, value] of form.entries()) if (typeof value === "string") params[key] = value;
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a form-encoded Twilio callback." }, { status: 400 });
  }
  if (!validTwilioSignature({ url, params, signature: request.headers.get("x-twilio-signature"), authToken }))
    return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 403 });

  const sid = String(params.MessageSid || params.SmsSid || "").trim();
  const next = deliveryStatusFromTwilio(params.MessageStatus || params.SmsStatus);
  if (!sid || !/^[A-Z]{2}[0-9a-f]{32}$/i.test(sid)) return NextResponse.json({ ok: false, error: "Missing MessageSid." }, { status: 400 });
  if (!next) return NextResponse.json({ ok: true, ignored: params.MessageStatus || null });

  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "Service unavailable." }, { status: 503 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Service unavailable." }, { status: 503 });

  const allowedFrom = next === "Delivered" ? ["Sent"] : ["Sent", "Delivered"];
  const error = next === "Failed" ? `Twilio reported ${params.MessageStatus || "failed"}${params.ErrorCode ? ` (error ${String(params.ErrorCode).slice(0, 10)})` : ""}.` : null;
  const { data, error: updateError } = await supabase
    .from("vyron_order_notification_deliveries")
    .update({ status: next, error, updated_at: new Date().toISOString() })
    .eq("provider_reference", sid)
    .in("channel", ["whatsapp", "sms"])
    .in("status", allowedFrom)
    .select("id");
  if (updateError) return NextResponse.json({ ok: false, error: "Update failed." }, { status: 500 });
  return NextResponse.json({ ok: true, updated: (data || []).length });
}
