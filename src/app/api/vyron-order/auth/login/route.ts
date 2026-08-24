import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  authenticateCustomerPin,
  setCustomerSessionCookie,
} from "@/lib/vyron-order-customer-auth";

export const runtime = "nodejs";

/**
 * VYRON ORDER customer sign-in.
 *
 * The body carries only a customer id and a PIN. There is deliberately no
 * company input: the tenant is read from the stored identity, so a caller
 * cannot pair a customer with a company it does not belong to.
 *
 * Every failure returns the same message and the same 401. Distinguishing
 * "unknown customer" from "wrong PIN" would turn this endpoint into a customer
 * enumerator. A lockout is the one exception, because the caller has to be told
 * that waiting is required.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "Ordering is not available." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Ordering is not available." }, { status: 503 });
  }

  let body: { customerId?: unknown; pin?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const customerId = String(body.customerId || "").trim();
  const pin = String(body.pin || "");
  if (!customerId || !pin) {
    return NextResponse.json({ ok: false, error: "Enter your customer and PIN." }, { status: 400 });
  }

  const outcome = await authenticateCustomerPin(supabase, {
    customerId,
    pin,
    userAgent: request.headers.get("user-agent"),
  });

  if (!outcome.ok) {
    if (outcome.reason === "unavailable") {
      return NextResponse.json({ ok: false, error: "Ordering is not available." }, { status: 503 });
    }
    if (outcome.reason === "locked") {
      const minutes = Math.max(1, Math.ceil((outcome.retryAfterSeconds || 900) / 60));
      return NextResponse.json(
        { ok: false, error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
        { status: 429 }
      );
    }
    return NextResponse.json({ ok: false, error: "Incorrect customer or PIN." }, { status: 401 });
  }

  // Only non-sensitive identity is returned; the token travels in the cookie.
  const response = NextResponse.json({
    ok: true,
    customer: { customerId: outcome.scope.customerId, customerName: outcome.scope.customerName },
  });
  setCustomerSessionCookie(response, outcome.token, outcome.scope.expiresAt);
  return response;
}
