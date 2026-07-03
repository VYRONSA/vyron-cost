import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { parseCookieJsonValue } from "@/lib/vyron-workspace-cookie-parse";

export type PlatformRole = "PLATFORM_ADMIN" | "PLATFORM_OPERATOR" | "PLATFORM_AUDITOR";

export type PlatformSessionCookie = {
  token: string;
  userId: string;
  email: string;
  role: PlatformRole;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
};

export type PlatformSessionRecord = {
  token: string;
  user_id: string;
  email: string;
  role: PlatformRole;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  revoked_at?: string | null;
};

export const PLATFORM_SESSION_COOKIE = "vyron_platform_session";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

function normalizeSupabaseUrl(url: string | undefined) {
  if (!url) return undefined;
  return url.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
}

function nowIso() {
  return new Date().toISOString();
}

function msUntil(iso: string) {
  const delta = new Date(iso).getTime() - Date.now();
  return Math.max(0, delta);
}

function cookieMaxAgeSeconds(expiresAt: string) {
  return Math.max(0, Math.floor(msUntil(expiresAt) / 1000));
}

function roleRank(role: PlatformRole) {
  if (role === "PLATFORM_ADMIN") return 3;
  if (role === "PLATFORM_OPERATOR") return 2;
  return 1;
}

function isRoleAllowed(role: PlatformRole, allowed: PlatformRole[]) {
  return allowed.some((candidate) => roleRank(role) >= roleRank(candidate));
}

function safeTrim(value: unknown) {
  return String(value || "").trim();
}

function readBootstrapAdminEmails() {
  return String(process.env.VYRON_PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((row) => row.trim().toLowerCase())
    .filter(Boolean);
}

function buildPlatformSession(userId: string, email: string, role: PlatformRole): PlatformSessionCookie {
  const now = Date.now();
  return {
    token: `${crypto.randomUUID()}-${Math.random().toString(16).slice(2)}`,
    userId,
    email,
    role,
    createdAt: new Date(now).toISOString(),
    lastActiveAt: new Date(now).toISOString(),
    expiresAt: new Date(now + IDLE_TIMEOUT_MS).toISOString(),
  };
}

function platformCookieOptions(maxAge: number) {
  return {
    path: "/",
    maxAge,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}

export function setPlatformSessionCookie(response: NextResponse, session: PlatformSessionCookie) {
  response.cookies.set(PLATFORM_SESSION_COOKIE, encodeURIComponent(JSON.stringify(session)), platformCookieOptions(cookieMaxAgeSeconds(session.expiresAt)));
  return response;
}

export function clearPlatformSessionCookie(response: NextResponse) {
  response.cookies.set(PLATFORM_SESSION_COOKIE, "", {
    ...platformCookieOptions(0),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

export function parsePlatformSessionCookie(raw: string | null | undefined): PlatformSessionCookie | null {
  return parseCookieJsonValue<PlatformSessionCookie>(raw);
}

export function readPlatformSessionFromRequest(request: NextRequest) {
  return parsePlatformSessionCookie(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value || null);
}

export async function readPlatformSessionFromServerCookies() {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    return parsePlatformSessionCookie(cookieStore.get(PLATFORM_SESSION_COOKIE)?.value || null);
  } catch {
    return null;
  }
}

async function resolvePlatformRoleForUser(userId: string, email: string): Promise<PlatformRole | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const bootstrap = readBootstrapAdminEmails();
    return bootstrap.includes(email.toLowerCase()) ? "PLATFORM_ADMIN" : null;
  }

  const { data, error } = await supabase
    .from("vyron_platform_users")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    const bootstrap = readBootstrapAdminEmails();
    return bootstrap.includes(email.toLowerCase()) ? "PLATFORM_ADMIN" : null;
  }

  if (data?.is_active === false) return null;

  const role = safeTrim(data?.role) as PlatformRole;
  if (role === "PLATFORM_ADMIN" || role === "PLATFORM_OPERATOR" || role === "PLATFORM_AUDITOR") {
    return role;
  }

  const bootstrap = readBootstrapAdminEmails();
  return bootstrap.includes(email.toLowerCase()) ? "PLATFORM_ADMIN" : null;
}

export async function appendPlatformAuditEvent(input: {
  eventType: string;
  success: boolean;
  email?: string;
  userId?: string;
  role?: PlatformRole | null;
  detail?: string;
  request?: NextRequest;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const ip =
    input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    input.request?.headers.get("x-real-ip") ||
    null;
  const userAgent = input.request?.headers.get("user-agent") || null;

  await supabase.from("vyron_platform_auth_audit").insert({
    event_type: input.eventType,
    success: input.success,
    user_id: input.userId || null,
    email: input.email || null,
    role: input.role || null,
    detail: input.detail || null,
    ip_address: ip,
    user_agent: userAgent,
    created_at: nowIso(),
  });
}

export async function authenticatePlatformLogin(email: string, password: string, request?: NextRequest) {
  const normalizedEmail = safeTrim(email).toLowerCase();
  if (!normalizedEmail || !password) {
    await appendPlatformAuditEvent({
      eventType: "platform.login.failed",
      success: false,
      email: normalizedEmail,
      detail: "Missing credentials.",
      request,
    });
    throw new Error("Email and password are required.");
  }

  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Platform authentication is not configured.");
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (signInError || !signInData.user?.id) {
    await appendPlatformAuditEvent({
      eventType: "platform.login.failed",
      success: false,
      email: normalizedEmail,
      detail: "Invalid credentials.",
      request,
    });
    throw new Error("Invalid email or password.");
  }

  const userId = String(signInData.user.id);
  const role = await resolvePlatformRoleForUser(userId, normalizedEmail);
  if (!role) {
    await appendPlatformAuditEvent({
      eventType: "platform.login.denied",
      success: false,
      email: normalizedEmail,
      userId,
      detail: "No platform role assigned.",
      request,
    });
    throw new Error("No platform role assigned to this account.");
  }

  const session = buildPlatformSession(userId, normalizedEmail, role);
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from("vyron_platform_sessions").insert({
      token: session.token,
      user_id: session.userId,
      email: session.email,
      role: session.role,
      created_at: session.createdAt,
      last_activity_at: session.lastActiveAt,
      expires_at: session.expiresAt,
      revoked_at: null,
    });
  }

  await appendPlatformAuditEvent({
    eventType: "platform.login.success",
    success: true,
    email: normalizedEmail,
    userId,
    role,
    detail: "Developer platform login successful.",
    request,
  });

  return session;
}

async function refreshPlatformSession(session: PlatformSessionCookie): Promise<PlatformSessionCookie | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (msUntil(session.expiresAt) <= 0) return null;
    const refreshed = {
      ...session,
      lastActiveAt: nowIso(),
      expiresAt: new Date(Date.now() + IDLE_TIMEOUT_MS).toISOString(),
    };
    return refreshed;
  }

  const { data, error } = await supabase
    .from("vyron_platform_sessions")
    .select("token, user_id, email, role, created_at, last_activity_at, expires_at, revoked_at")
    .eq("token", session.token)
    .maybeSingle();

  if (error || !data || data.revoked_at) return null;

  const createdAtMs = new Date(data.created_at).getTime();
  const absoluteExpiryMs = createdAtMs + ABSOLUTE_TIMEOUT_MS;
  const nowMs = Date.now();

  if (nowMs >= new Date(data.expires_at).getTime() || nowMs >= absoluteExpiryMs) {
    await supabase
      .from("vyron_platform_sessions")
      .update({ revoked_at: nowIso() })
      .eq("token", session.token);

    return null;
  }

  const role = safeTrim(data.role) as PlatformRole;
  if (role !== "PLATFORM_ADMIN" && role !== "PLATFORM_OPERATOR" && role !== "PLATFORM_AUDITOR") {
    return null;
  }

  const nextLastActive = nowIso();
  const nextExpires = new Date(Math.min(nowMs + IDLE_TIMEOUT_MS, absoluteExpiryMs)).toISOString();

  await supabase
    .from("vyron_platform_sessions")
    .update({ last_activity_at: nextLastActive, expires_at: nextExpires })
    .eq("token", session.token);

  return {
    token: data.token,
    userId: String(data.user_id),
    email: String(data.email),
    role,
    createdAt: String(data.created_at),
    lastActiveAt: nextLastActive,
    expiresAt: nextExpires,
  };
}

export async function requirePlatformSessionFromRequest(
  request: NextRequest,
  allowedRoles: PlatformRole[] = ["PLATFORM_ADMIN", "PLATFORM_OPERATOR", "PLATFORM_AUDITOR"]
) {
  const cookie = readPlatformSessionFromRequest(request);
  if (!cookie) {
    await appendPlatformAuditEvent({
      eventType: "platform.access.denied",
      success: false,
      detail: "Missing platform session cookie.",
      request,
    });
    throw new Error("Developer authentication required.");
  }

  const refreshed = await refreshPlatformSession(cookie);
  if (!refreshed) {
    await appendPlatformAuditEvent({
      eventType: "platform.access.denied",
      success: false,
      email: cookie.email,
      userId: cookie.userId,
      role: cookie.role,
      detail: "Session expired or revoked.",
      request,
    });
    throw new Error("Developer session expired. Please sign in again.");
  }

  if (!isRoleAllowed(refreshed.role, allowedRoles)) {
    await appendPlatformAuditEvent({
      eventType: "platform.access.denied",
      success: false,
      email: refreshed.email,
      userId: refreshed.userId,
      role: refreshed.role,
      detail: "Role not authorized for this action.",
      request,
    });
    throw new Error("Insufficient platform role.");
  }

  return refreshed;
}

export async function requirePlatformSessionServer(
  allowedRoles: PlatformRole[] = ["PLATFORM_ADMIN", "PLATFORM_OPERATOR", "PLATFORM_AUDITOR"]
) {
  const cookie = await readPlatformSessionFromServerCookies();
  if (!cookie) {
    throw new Error("Developer authentication required.");
  }

  const refreshed = await refreshPlatformSession(cookie);
  if (!refreshed) {
    throw new Error("Developer session expired. Please sign in again.");
  }

  if (!isRoleAllowed(refreshed.role, allowedRoles)) {
    throw new Error("Insufficient platform role.");
  }

  return refreshed;
}

export function developerApiUnauthorized(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

export async function revokePlatformSession(token: string, request?: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !token) return;

  const { data } = await supabase
    .from("vyron_platform_sessions")
    .select("user_id, email, role")
    .eq("token", token)
    .maybeSingle();

  await supabase
    .from("vyron_platform_sessions")
    .update({ revoked_at: nowIso() })
    .eq("token", token);

  await appendPlatformAuditEvent({
    eventType: "platform.logout",
    success: true,
    userId: data?.user_id ? String(data.user_id) : undefined,
    email: data?.email ? String(data.email) : undefined,
    role: (safeTrim(data?.role) as PlatformRole) || null,
    detail: "Developer platform logout.",
    request,
  });
}
