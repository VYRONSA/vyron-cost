import type { NextResponse } from "next/server";
import {
  signWorkspaceToken,
  verifyWorkspaceToken,
  WORKSPACE_SESSION_TTL_SECONDS,
} from "@/lib/vyron-workspace-session-token";

export const VYRON_AUTH_USER_COOKIE = "vyron_auth_user_id";

const AUTH_USER_COOKIE_MAX_AGE = WORKSPACE_SESSION_TTL_SECONDS;

export function authUserCookieOptions(maxAge: number = AUTH_USER_COOKIE_MAX_AGE) {
  return {
    path: "/",
    maxAge,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}

/**
 * The signed-in auth user, as a token this server signed.
 *
 * It used to hold the bare auth user id, and /api/workspace/restore-session
 * turned that id into a full workspace session — so writing someone else's id
 * into the cookie signed you in as them.
 */
export function setAuthUserCookie(response: NextResponse, authUserId: string) {
  response.cookies.set(
    VYRON_AUTH_USER_COOKIE,
    signWorkspaceToken({ kind: "au", userId: authUserId }),
    authUserCookieOptions()
  );
  return response;
}

export function clearAuthUserCookie(response: NextResponse) {
  response.cookies.set(VYRON_AUTH_USER_COOKIE, "", {
    ...authUserCookieOptions(0),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

/** The auth user a verified token names, or null. Unsigned or expired values name nobody. */
export async function getAuthUserIdFromCookies(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    return verifyWorkspaceToken(cookieStore.get(VYRON_AUTH_USER_COOKIE)?.value, "au")?.sub || null;
  } catch {
    return null;
  }
}
