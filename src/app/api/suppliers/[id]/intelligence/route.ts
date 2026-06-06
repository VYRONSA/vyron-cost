import { NextResponse } from "next/server";
import { getSupplierIntelligenceProfile } from "@/lib/vyron-supplier-intelligence-centre";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const profile = await getSupplierIntelligenceProfile(id, VYRON_DEFAULT_TENANT_ID);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
