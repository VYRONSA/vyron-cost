import { NextResponse } from "next/server";
import { getProcurementRecommendations } from "@/lib/vyron-procurement-ai-data";
import { recomputeProcurementRecommendations } from "@/lib/vyron-procurement-ai-engine";
import { requireApiCompanyId, resolveApiCompanyId } from "@/lib/vyron-api-workspace";

export const runtime = "nodejs";

export async function GET() {
  try {
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, recommendations: [] });
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
    const companyId = await requireApiCompanyId();
    const generated = await recomputeProcurementRecommendations(companyId);
    const recommendations = await getProcurementRecommendations();
    return NextResponse.json({ ok: true, count: generated.length, recommendations });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Recompute failed." },
      { status: error instanceof Error && error.message.includes("workspace") ? 400 : 500 }
    );
  }
}
