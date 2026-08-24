import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";

/**
 * VYRON ORDER — customer portal authentication.
 *
 * Staff sign in through Supabase Auth; the developer console uses its own
 * server-side session table. A customer is neither: they are a row in
 * vyron_customers, not a platform user, so this follows the proven
 * server-side-session shape rather than minting Supabase accounts for every
 * customer of every tenant.
 *
 * The security properties that matter here:
 *
 *  - The PIN is never stored. Only a scrypt derivation with a per-identity
 *    random salt is persisted, and comparison is constant time.
 *  - The session token is returned to the browser exactly once, in an httpOnly
 *    cookie. Only its SHA-256 hash is stored, so read access to the database
 *    does not let anyone impersonate a customer.
 *  - Tenant and customer scope are read from the session row on the server.
 *    Nothing downstream ever accepts a company or customer id from the client.
 *  - Failures are counted on the identity and lock it, so attempts cannot be
 *    reset by clearing cookies, and the error text never distinguishes "no such
 *    customer" from "wrong PIN".
 */

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;
export const PIN_ALGORITHM = "scrypt$N=16384,r=8,p=1,len=64";

/** A PIN is short by design, so the brute-force ceiling has to be low. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/** Idle timeout, refreshed on activity, bounded by an absolute lifetime. */
const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const ABSOLUTE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export const CUSTOMER_SESSION_COOKIE = "vyron_order_session";

export type CustomerSessionScope = {
  sessionId: string;
  identityId: string;
  companyId: string;
  customerId: string;
  customerName: string;
  displayName: string;
  expiresAt: string;
};

export type CustomerLoginOutcome =
  | { ok: true; token: string; scope: CustomerSessionScope }
  | { ok: false; reason: "invalid" | "locked" | "unavailable"; retryAfterSeconds?: number };

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Normalised so "1234" and " 1234 " are the same secret, nothing more. */
function normalisePin(pin: string) {
  return String(pin ?? "").trim();
}

export function isPinAcceptable(pin: string) {
  const value = normalisePin(pin);
  return /^\d{4,8}$/.test(value);
}

export async function derivePinHash(pin: string, salt: string) {
  const derived = await scrypt(normalisePin(pin), salt, SCRYPT_KEYLEN);
  return derived.toString("hex");
}

export function newPinSalt() {
  return randomBytes(32).toString("hex");
}

async function pinMatches(pin: string, salt: string, expectedHex: string) {
  const actual = await scrypt(normalisePin(pin), salt, SCRYPT_KEYLEN);
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(actual, expected);
}

/* ------------------------------------------------------------------ audit */

export async function recordCustomerAuthEvent(
  supabase: SupabaseClient,
  input: {
    companyId?: string | null;
    customerId?: string | null;
    identityId?: string | null;
    event: string;
    detail?: string | null;
    userAgent?: string | null;
  }
) {
  // Audit must never break the request it is describing.
  try {
    await supabase.from("vyron_customer_portal_auth_events").insert({
      company_id: input.companyId ?? null,
      customer_id: input.customerId ?? null,
      identity_id: input.identityId ?? null,
      event: input.event,
      detail: input.detail ?? null,
      user_agent: input.userAgent ? String(input.userAgent).slice(0, 400) : null,
    });
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------ provisioning */

/**
 * Create or reset a customer's portal PIN. Admin-side only — never reachable
 * from the customer portal itself. Returns no secret material.
 */
export async function setCustomerPortalPin(
  supabase: SupabaseClient,
  companyId: string,
  input: { customerId: string; pin: string; displayName?: string }
): Promise<{ identityId: string }> {
  if (!isPinAcceptable(input.pin)) {
    throw new Error("PIN must be 4 to 8 digits.");
  }

  // The customer must belong to this company — never trust the caller's pairing.
  const { data: customer, error: customerError } = await supabase
    .from("vyron_customers")
    .select("id, customer_name")
    .eq("company_id", companyId)
    .eq("id", input.customerId)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!customer) throw new Error("Customer not found in the active company.");

  const salt = newPinSalt();
  const hash = await derivePinHash(input.pin, salt);
  const displayName = input.displayName?.trim() || String(customer.customer_name || "Customer");

  const { data: existing } = await supabase
    .from("vyron_customer_portal_identities")
    .select("id")
    .eq("customer_id", input.customerId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("vyron_customer_portal_identities")
      .update({
        company_id: companyId,
        display_name: displayName,
        pin_hash: hash,
        pin_salt: salt,
        pin_algorithm: PIN_ALGORITHM,
        failed_attempts: 0,
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    await recordCustomerAuthEvent(supabase, {
      companyId,
      customerId: input.customerId,
      identityId: String(existing.id),
      event: "pin_reset",
    });
    return { identityId: String(existing.id) };
  }

  const { data: created, error } = await supabase
    .from("vyron_customer_portal_identities")
    .insert({
      company_id: companyId,
      customer_id: input.customerId,
      display_name: displayName,
      pin_hash: hash,
      pin_salt: salt,
      pin_algorithm: PIN_ALGORITHM,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordCustomerAuthEvent(supabase, {
    companyId,
    customerId: input.customerId,
    identityId: String(created.id),
    event: "pin_created",
  });
  return { identityId: String(created.id) };
}

/** Portal sign-in options for a company. Never returns hashes or salts. */
export async function listPortalCustomers(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_customer_portal_identities")
    .select("customer_id, display_name")
    .eq("company_id", companyId)
    .eq("status", "Active")
    .order("display_name");
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    customerId: String(row.customer_id),
    displayName: String(row.display_name),
  }));
}

/* ---------------------------------------------------------------- sign in */

/**
 * Sign a customer in.
 *
 * The caller supplies only a customer id and a PIN. The tenant is read from the
 * identity row, never from the request, so a client cannot pair a customer with
 * a company it does not belong to — there is no company input to forge.
 */
export async function authenticateCustomerPin(
  supabase: SupabaseClient,
  input: { customerId: string; pin: string; userAgent?: string | null }
): Promise<CustomerLoginOutcome> {
  const { data: identity, error } = await supabase
    .from("vyron_customer_portal_identities")
    .select("id, company_id, customer_id, display_name, pin_hash, pin_salt, status, failed_attempts, locked_until")
    .eq("customer_id", input.customerId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable" };

  // Tenant scope is derived here and used for everything below.
  const companyId = identity ? String(identity.company_id) : null;

  /*
   * No identity, suspended identity and wrong PIN all return the same generic
   * failure so the endpoint cannot be used to enumerate customers. The work of
   * a scrypt derivation is still performed on the miss path to keep the timing
   * of "no such customer" close to "wrong PIN".
   */
  if (!identity || identity.status !== "Active") {
    await derivePinHash(input.pin, newPinSalt());
    await recordCustomerAuthEvent(supabase, {
      companyId,
      customerId: input.customerId,
      event: "login_failed",
      detail: identity ? "identity not active" : "no identity",
      userAgent: input.userAgent,
    });
    return { ok: false, reason: "invalid" };
  }

  const lockedUntil = identity.locked_until ? new Date(String(identity.locked_until)).getTime() : 0;
  if (lockedUntil > Date.now()) {
    await recordCustomerAuthEvent(supabase, {
      companyId,
      customerId: input.customerId,
      identityId: String(identity.id),
      event: "login_blocked",
      detail: "locked out",
      userAgent: input.userAgent,
    });
    return { ok: false, reason: "locked", retryAfterSeconds: Math.ceil((lockedUntil - Date.now()) / 1000) };
  }

  const matched = await pinMatches(input.pin, String(identity.pin_salt), String(identity.pin_hash));

  if (!matched) {
    const attempts = Number(identity.failed_attempts || 0) + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await supabase
      .from("vyron_customer_portal_identities")
      .update({
        failed_attempts: lock ? 0 : attempts,
        locked_until: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", identity.id);
    await recordCustomerAuthEvent(supabase, {
      companyId,
      customerId: input.customerId,
      identityId: String(identity.id),
      event: lock ? "login_locked" : "login_failed",
      detail: `attempt ${attempts}`,
      userAgent: input.userAgent,
    });
    return lock
      ? { ok: false, reason: "locked", retryAfterSeconds: LOCKOUT_MINUTES * 60 }
      : { ok: false, reason: "invalid" };
  }

  const { data: customer } = await supabase
    .from("vyron_customers")
    .select("customer_name")
    .eq("company_id", companyId as string)
    .eq("id", input.customerId)
    .maybeSingle();

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + IDLE_TIMEOUT_MS).toISOString();

  const { data: session, error: sessionError } = await supabase
    .from("vyron_customer_portal_sessions")
    .insert({
      token_hash: sha256(token),
      identity_id: identity.id,
      company_id: companyId,
      customer_id: input.customerId,
      expires_at: expiresAt,
      user_agent: input.userAgent ? String(input.userAgent).slice(0, 400) : null,
    })
    .select("id")
    .single();
  if (sessionError) return { ok: false, reason: "unavailable" };

  await supabase
    .from("vyron_customer_portal_identities")
    .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq("id", identity.id);

  await recordCustomerAuthEvent(supabase, {
    companyId,
    customerId: input.customerId,
    identityId: String(identity.id),
    event: "login_success",
    userAgent: input.userAgent,
  });

  return {
    ok: true,
    token,
    scope: {
      sessionId: String(session.id),
      identityId: String(identity.id),
      companyId: companyId as string,
      customerId: input.customerId,
      customerName: String(customer?.customer_name || identity.display_name),
      displayName: String(identity.display_name),
      expiresAt,
    },
  };
}

/* --------------------------------------------------------------- sessions */

/**
 * Resolve a raw token to its tenant and customer scope.
 *
 * This is the ONLY place a customer's company and customer id are established.
 * Every customer-facing endpoint must use the returned scope and must ignore
 * any company or customer identifier supplied by the browser.
 */
export async function resolveCustomerSession(
  supabase: SupabaseClient,
  token: string | null | undefined
): Promise<CustomerSessionScope | null> {
  const raw = String(token || "").trim();
  if (!raw) return null;

  const { data, error } = await supabase
    .from("vyron_customer_portal_sessions")
    .select("id, identity_id, company_id, customer_id, created_at, expires_at, revoked_at")
    .eq("token_hash", sha256(raw))
    .maybeSingle();
  if (error || !data) return null;
  if (data.revoked_at) return null;

  const now = Date.now();
  if (new Date(String(data.expires_at)).getTime() <= now) return null;
  if (new Date(String(data.created_at)).getTime() + ABSOLUTE_LIFETIME_MS <= now) return null;

  const { data: identity } = await supabase
    .from("vyron_customer_portal_identities")
    .select("id, display_name, status")
    .eq("id", data.identity_id)
    .maybeSingle();
  if (!identity || identity.status !== "Active") return null;

  const { data: customer } = await supabase
    .from("vyron_customers")
    .select("customer_name")
    .eq("company_id", data.company_id)
    .eq("id", data.customer_id)
    .maybeSingle();
  if (!customer) return null;

  // Sliding idle window — activity extends the session, the absolute lifetime
  // above still caps it.
  const nextExpiry = new Date(now + IDLE_TIMEOUT_MS).toISOString();
  await supabase
    .from("vyron_customer_portal_sessions")
    .update({ last_activity_at: new Date().toISOString(), expires_at: nextExpiry })
    .eq("id", data.id);

  return {
    sessionId: String(data.id),
    identityId: String(data.identity_id),
    companyId: String(data.company_id),
    customerId: String(data.customer_id),
    customerName: String(customer.customer_name || identity.display_name),
    displayName: String(identity.display_name),
    expiresAt: nextExpiry,
  };
}

export async function revokeCustomerSession(supabase: SupabaseClient, token: string | null | undefined) {
  const raw = String(token || "").trim();
  if (!raw) return;
  const { data } = await supabase
    .from("vyron_customer_portal_sessions")
    .select("id, company_id, customer_id, identity_id")
    .eq("token_hash", sha256(raw))
    .maybeSingle();
  if (!data) return;
  await supabase
    .from("vyron_customer_portal_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", data.id);
  await recordCustomerAuthEvent(supabase, {
    companyId: String(data.company_id),
    customerId: String(data.customer_id),
    identityId: String(data.identity_id),
    event: "logout",
  });
}

/* ---------------------------------------------------------------- cookies */

export function customerSessionCookieOptions(maxAgeSeconds: number) {
  return {
    path: "/",
    maxAge: maxAgeSeconds,
    sameSite: "lax" as const,
    // The token must never be readable by client script.
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}

export function setCustomerSessionCookie(response: NextResponse, token: string, expiresAt: string) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  response.cookies.set(CUSTOMER_SESSION_COOKIE, token, customerSessionCookieOptions(maxAge));
}

export function clearCustomerSessionCookie(response: NextResponse) {
  response.cookies.set(CUSTOMER_SESSION_COOKIE, "", customerSessionCookieOptions(0));
}

/** Read the raw token from the request cookies in a route handler. */
export async function readCustomerSessionToken(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get(CUSTOMER_SESSION_COOKIE)?.value || null;
  } catch {
    return null;
  }
}
