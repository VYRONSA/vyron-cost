import { NextResponse } from "next/server";
import { getSupplierIntelligenceCentreStats } from "@/lib/vyron-supplier-intelligence-centre";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export async function GET() {
  try {
    const stats = await getSupplierIntelligenceCentreStats(VYRON_DEFAULT_TENANT_ID);
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
