import { NextRequest, NextResponse } from "next/server";
import { parsePlatformSessionCookie, PLATFORM_SESSION_COOKIE } from "@/lib/vyron-platform-auth";

function isExpired(iso: string) {
  return Number.isNaN(new Date(iso).getTime()) || new Date(iso).getTime() <= Date.now();
}

function hasValidPlatformCookie(request: NextRequest) {
  const raw = request.cookies.get(PLATFORM_SESSION_COOKIE)?.value;
  const parsed = parsePlatformSessionCookie(raw || null);
  if (!parsed?.token || !parsed.expiresAt) return false;
  if (isExpired(parsed.expiresAt)) return false;
  return true;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const developerRoute = pathname.startsWith("/developer");
  const developerApiRoute = pathname.startsWith("/api/developer");

  if (!developerRoute && !developerApiRoute) {
    return NextResponse.next();
  }

  if (hasValidPlatformCookie(request)) {
    return NextResponse.next();
  }

  if (developerApiRoute) {
    return NextResponse.json({ ok: false, error: "Developer authentication required." }, { status: 401 });
  }

  const loginUrl = new URL("/developer-login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/developer/:path*", "/api/developer/:path*"],
};
