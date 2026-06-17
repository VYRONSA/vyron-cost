import { NextResponse } from "next/server";
import { getSalesIntelligence } from "@/lib/vyron-customer-invoices";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

const EMPTY_REPORT = {
  salesByCustomer: [],
  salesByProduct: [],
  topCustomers: [],
  topProducts: [],
  monthlySales: [],
  invoiceTrends: [],
};

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("reports.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, report: EMPTY_REPORT });
    const report = await getSalesIntelligence(supabase, companyId);
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Report failed.");
  }
}
