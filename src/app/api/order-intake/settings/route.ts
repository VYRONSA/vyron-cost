import { NextRequest, NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";
import { orderErrorResponse, orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { namesFor } from "@/lib/order-engine/names";
import { loadDecisionRegister } from "@/lib/order-engine/decisions";
import { listMailboxes } from "@/lib/order-engine/mailboxes";
import { listChannelSettings, loadOrderSettings, saveOrderSettings } from "@/lib/order-engine/settings";

export const runtime = "nodejs";

/**
 * GET /api/order-intake/settings — this company's ordering configuration:
 * settings (defaults when none are saved), channels, mailboxes and the
 * decision register (what is decided, what is still awaited).
 */
export async function GET() {
  try {
    const { supabase, companyId } = await orderRouteContext("sales_orders.view");
    const [settings, channels, mailboxes, decisions] = await Promise.all([
      loadOrderSettings(supabase, companyId),
      listChannelSettings(supabase, companyId),
      listMailboxes(supabase, companyId),
      loadDecisionRegister(supabase, companyId),
    ]);
    const names = await namesFor(supabase, companyId, { customers: [settings.b2cCustomerId] });
    return NextResponse.json({
      ok: true,
      settings: { ...settings, b2cCustomerName: settings.b2cCustomerId ? names.customers.get(settings.b2cCustomerId) ?? null : null },
      channels,
      // Mailbox policy is configuration, not secrets: no credentials are held here.
      mailboxes,
      decisions,
    });
  } catch (error) {
    return orderErrorResponse(error, "Load ordering settings failed.");
  }
}

/**
 * PUT /api/order-intake/settings — the company's ordering decisions.
 * A commercial control: approvers only. Always this company.
 */
export async function PUT(request: NextRequest) {
  try {
    const { supabase, companyId, actor, can } = await orderRouteContext("sales_orders.view");
    if (!can("sales_orders.approve")) throw new WorkspaceAccessError("Access denied.", 403);
    const body = await readJsonBody(request);
    const settings = await saveOrderSettings(
      supabase,
      companyId,
      {
        b2cCustomerId: body.b2cCustomerId ? String(body.b2cCustomerId) : null,
        productNameMatching: typeof body.productNameMatching === "string" ? body.productNameMatching : undefined,
        duplicatePoAction: typeof body.duplicatePoAction === "string" ? body.duplicatePoAction : undefined,
        minLeadTimeDays: body.minLeadTimeDays as number | string | null,
        webOrdersMode: typeof body.webOrdersMode === "string" ? body.webOrdersMode : null,
        webOrderStatuses: Array.isArray(body.webOrderStatuses) ? (body.webOrderStatuses as string[]) : null,
        webPricesIncludeTax: typeof body.webPricesIncludeTax === "boolean" ? body.webPricesIncludeTax : null,
        shippingTreatment: typeof body.shippingTreatment === "string" ? body.shippingTreatment : null,
        skuAlignment: typeof body.skuAlignment === "string" ? body.skuAlignment : null,
        creatorCanApprove: typeof body.creatorCanApprove === "boolean" ? body.creatorCanApprove : null,
        pdfExtractor: typeof body.pdfExtractor === "string" ? body.pdfExtractor : null,
      },
      actor
    );
    return NextResponse.json({ ok: true, settings, decisions: await loadDecisionRegister(supabase, companyId) });
  } catch (error) {
    return orderErrorResponse(error, "Save ordering settings failed.");
  }
}
