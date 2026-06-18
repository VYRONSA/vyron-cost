import { NextResponse } from "next/server";
import { clearAuthUserCookie } from "@/lib/vyron-workspace-auth";
import { clearWorkspaceAuthCookies } from "@/lib/vyron-workspace-cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true, message: "Workspace session cleared." });
  clearWorkspaceAuthCookies(response);
  clearAuthUserCookie(response);
  return response;
}
