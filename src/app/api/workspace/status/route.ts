import { NextResponse } from "next/server";
import { buildWorkspaceStatusReport } from "@/lib/vyron-workspace-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await buildWorkspaceStatusReport();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Workspace status failed." },
      { status: 500 }
    );
  }
}
