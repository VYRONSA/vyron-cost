import { NextResponse } from "next/server";
import { getProcurementExecutiveStats } from "@/lib/vyron-procurement-ai-data";

export const runtime = "nodejs";

export async function GET() {
  try {
    const stats = await getProcurementExecutiveStats();
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Health load failed." },
      { status: 500 }
    );
  }
}
