import { NextResponse } from "next/server";
import { clearWorkspaceAuthCookies } from "@/lib/vyron-workspace-cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true, message: "Workspace session cleared." });
  clearWorkspaceAuthCookies(response);
  return response;
}
