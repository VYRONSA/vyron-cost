import { NextResponse } from "next/server";
import { fetchFinanceExportRows } from "@/lib/vyron-finance-exports";

const VALID = new Set([
  "invoices",
  "purchase-orders",
  "grns",
  "inventory-adjustments",
  "production-journals",
  "recovery-journals",
  "cost-updates",
]);

export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!VALID.has(type)) {
    return NextResponse.json({ ok: false, error: "Unknown export type" }, { status: 400 });
  }
  try {
    const rows = await fetchFinanceExportRows(type as Parameters<typeof fetchFinanceExportRows>[0]);
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Export failed" }, { status: 500 });
  }
}
