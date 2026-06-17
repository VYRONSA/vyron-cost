import { NextRequest, NextResponse } from "next/server";
import {
  getVyronCoreCommandCentreData,
  runWorkforceSimulation,
  saveWorkforceSimulation,
  type SimulationInput,
} from "@/lib/vyron-workforce-digital-twin";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveApiCompanyId } from "@/lib/vyron-api-workspace";

export const runtime = "nodejs";

export async function GET() {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  try {
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, simulations: [] });
    const data = await getVyronCoreCommandCentreData(supabase, companyId);
    return NextResponse.json({ ok: true, simulations: data.simulations });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Simulation list failed." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  const body = await request.json().catch(() => ({}));

  const input: SimulationInput = {
    scenarioName: String(body.scenarioName || "Custom scenario"),
    scenarioType: body.scenarioType || "overtime",
    params: (body.params || {}) as Record<string, number>,
  };

  try {
    const companyId = await requireApiCompanyId();
    const result = runWorkforceSimulation(input);
    const saved = await saveWorkforceSimulation(supabase, companyId, result);
    return NextResponse.json({ ok: true, simulation: saved });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Simulation failed." },
      { status: 500 }
    );
  }
}
