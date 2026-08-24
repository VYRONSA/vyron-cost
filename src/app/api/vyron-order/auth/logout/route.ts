import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  clearCustomerSessionCookie,
  readCustomerSessionToken,
  revokeCustomerSession,
} from "@/lib/vyron-order-customer-auth";

export const runtime = "nodejs";

/** Revokes the session server-side, then clears the cookie. */
export async function POST() {
  const supabase = getSupabaseAdmin();
  const token = await readCustomerSessionToken();
  if (supabase && token) await revokeCustomerSession(supabase, token);
  const response = NextResponse.json({ ok: true });
  clearCustomerSessionCookie(response);
  return response;
}
