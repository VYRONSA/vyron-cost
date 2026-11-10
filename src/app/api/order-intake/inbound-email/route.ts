import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { receiveConnectorMessage } from "@/lib/order-engine/connectors/email-connector";
import { OrderEngineError } from "@/lib/order-engine/errors";
import {
  normalizeGenericPayload,
  normalizePostmarkPayload,
  verifyBasicAuthSecret,
  verifyGenericSignature,
} from "@/lib/order-engine/inbound-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 25 * 1024 * 1024;
const ACTOR = { userId: "system:inbound-email", name: "Inbound e-mail" };

/**
 * POST ?provider=generic|postmark — inbound customer order e-mail from the mail provider.
 *
 * Authenticated with VYRON_MAIL_WEBHOOK_SECRET (generic: timestamped HMAC; postmark: Basic auth).
 * The tenant comes only from the delivered-to address (vyron_order_mailboxes); the e-mail channel
 * must be Active; the message is judged and either quarantined or taken into the Order Inbox for
 * review. Nothing here creates a sales order — a person approves each order in the Order Inbox.
 * Permanent refusals answer 200 with a status so the provider does not retry them.
 */
export async function POST(request: Request) {
  const secret = String(process.env.VYRON_MAIL_WEBHOOK_SECRET || "").trim();
  if (!secret) return NextResponse.json({ ok: false, error: "Inbound e-mail is not configured." }, { status: 503 });
  const provider = new URL(request.url).searchParams.get("provider") === "postmark" ? "postmark" : "generic";

  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "Message too large." }, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "Message too large." }, { status: 413 });

  if (provider === "postmark") {
    if (!verifyBasicAuthSecret(request.headers.get("authorization"), secret)) return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  } else {
    const check = verifyGenericSignature({
      rawBody,
      timestamp: request.headers.get("x-volora-timestamp"),
      signature: request.headers.get("x-volora-signature"),
      secret,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    if (!check.ok) return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  }

  let message;
  try {
    const json = JSON.parse(rawBody) as Record<string, unknown>;
    message = provider === "postmark" ? normalizePostmarkPayload(json) : normalizeGenericPayload(json);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "Unreadable message." }, { status: 400 });
  }

  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "Service unavailable." }, { status: 503 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Service unavailable." }, { status: 503 });

  try {
    const result = await receiveConnectorMessage(supabase, message, ACTOR);
    // Status only: never echo tenant ids or order content back to the provider.
    if (result.status === "ACCEPTED")
      return NextResponse.json({ ok: true, status: result.status, intake: result.result.status, duplicate: result.result.duplicate, orders: result.result.orders.length });
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    if (error instanceof OrderEngineError) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 400 });
    console.error("[inbound-email] intake failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Intake failed." }, { status: 500 });
  }
}
