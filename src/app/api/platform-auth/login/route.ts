import { NextRequest, NextResponse } from "next/server";
import {
  authenticatePlatformLogin,
  setPlatformSessionCookie,
  clearPlatformSessionCookie,
} from "@/lib/vyron-platform-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = String(body.email || "").trim();
    const password = String(body.password || "");

    const session = await authenticatePlatformLogin(email, password, request);
    const response = NextResponse.json({ ok: true, redirect: "/developer", role: session.role });
    setPlatformSessionCookie(response, session);
    return response;
  } catch (error) {
    const response = NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Developer login failed." },
      { status: 401 }
    );
    clearPlatformSessionCookie(response);
    return response;
  }
}
