import { NextResponse } from "next/server";
import { runEnterpriseScenario, type ScenarioInput } from "@/lib/vyron-enterprise-scenarios";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ScenarioInput;
    const impact = await runEnterpriseScenario({
      supplierPriceIncreasePct: Number(body.supplierPriceIncreasePct || 0),
      packagingIncreasePct: Number(body.packagingIncreasePct || 0),
      salesDecreasePct: Number(body.salesDecreasePct || 0),
    });
    return NextResponse.json({ ok: true, impact });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
