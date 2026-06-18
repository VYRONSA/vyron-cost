import type { NextResponse } from "next/server";

export const VYRON_AUTH_USER_COOKIE = "vyron_auth_user_id";

const AUTH_USER_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function authUserCookieOptions(maxAge: number = AUTH_USER_COOKIE_MAX_AGE) {
  return {
    path: "/",
    maxAge,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}

export function setAuthUserCookie(response: NextResponse, authUserId: string) {
  response.cookies.set(VYRON_AUTH_USER_COOKIE, authUserId, authUserCookieOptions());
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

export async function getAuthUserIdFromCookies(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const value = cookieStore.get(VYRON_AUTH_USER_COOKIE)?.value?.trim();
    return value || null;
  } catch {
    return null;
  }
}
