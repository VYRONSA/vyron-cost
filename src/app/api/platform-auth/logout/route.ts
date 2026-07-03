import { NextRequest, NextResponse } from "next/server";
import {
  clearPlatformSessionCookie,
  readPlatformSessionFromRequest,
  revokePlatformSession,
} from "@/lib/vyron-platform-auth";
import { clearWorkspaceAuthCookies } from "@/lib/vyron-workspace-cookies";
import { clearAuthUserCookie } from "@/lib/vyron-workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = readPlatformSessionFromRequest(request);
  if (session?.token) {
    await revokePlatformSession(session.token, request);
  }

  const response = NextResponse.json({ ok: true, message: "Developer session cleared." });
  clearPlatformSessionCookie(response);
  clearWorkspaceAuthCookies(response);
  clearAuthUserCookie(response);
  return response;
}
