import { NextResponse } from "next/server";
import { getProcurementRecommendations } from "@/lib/vyron-procurement-ai-data";
import { recomputeProcurementRecommendations } from "@/lib/vyron-procurement-ai-engine";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export const runtime = "nodejs";

export async function GET() {
  try {
    const recommendations = await getProcurementRecommendations();
    return NextResponse.json({ ok: true, recommendations });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Load failed." },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const generated = await recomputeProcurementRecommendations(VYRON_DEFAULT_TENANT_ID);
    const recommendations = await getProcurementRecommendations();
    return NextResponse.json({ ok: true, count: generated.length, recommendations });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Recompute failed." },
      { status: 500 }
    );
  }
}
