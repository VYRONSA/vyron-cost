import type { SupabaseClient } from "@supabase/supabase-js";

export type ThreeWayMatchStatus =
  | "Matched"
  | "Partial Match"
  | "Price Variance"
  | "Quantity Variance"
  | "Missing PO"
  | "Missing GRN";

export type ThreeWayMatchResult = {
  matchStatus: ThreeWayMatchStatus;
  poQty: number;
  invoiceQty: number;
  grnQty: number;
  qtyVariance: number;
  poTotal: number;
  invoiceTotal: number;
  grnTotal: number;
  totalVariance: number;
  priceVariance: number;
  missingPo: boolean;
  missingGrn: boolean;
  details: Record<string, unknown>;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function computeThreeWayMatch(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    documentId: string;
    purchaseOrderId: string;
  }
): Promise<ThreeWayMatchResult> {
  const { companyId, documentId, purchaseOrderId } = params;

  const [{ data: po }, { data: poLines }, { data: document }, { data: invoiceLines }, { data: grns }] =
    await Promise.all([
      supabase.from("vyron_cost_purchase_orders").select("*").eq("id", purchaseOrderId).maybeSingle(),
      supabase
        .from("vyron_cost_purchase_order_lines")
        .select("*")
        .eq("purchase_order_id", purchaseOrderId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("vyron_documents")
        .select("id, total, subtotal, purchase_order_number, purchase_order_id")
        .eq("id", documentId)
        .maybeSingle(),
      supabase
        .from("vyron_document_line_items")
        .select("quantity, unit_price, line_total, ignored")
        .eq("document_id", documentId),
      supabase
        .from("vyron_cost_goods_receipts")
        .select("id")
        .eq("purchase_order_id", purchaseOrderId)
        .eq("company_id", companyId)
        .order("received_at", { ascending: false })
        .limit(1),
    ]);

  if (!po) {
    return {
      matchStatus: "Missing PO",
      poQty: 0,
      invoiceQty: 0,
      grnQty: 0,
      qtyVariance: 0,
      poTotal: 0,
      invoiceTotal: 0,
      grnTotal: 0,
      totalVariance: 0,
      priceVariance: 0,
      missingPo: true,
      missingGrn: true,
      details: { error: "Purchase order not found" },
    };
  }

  const poQty = (poLines || []).reduce((s, l) => s + Number(l.ordered_qty || l.quantity || 0), 0);
  const activeInvoiceLines = (invoiceLines || []).filter((l) => !l.ignored);
  const invoiceQty = activeInvoiceLines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const invoiceTotal = Number(document?.total || 0);
  const poTotal = Number(po.total || po.expected_total || 0);

  let grnQty = 0;
  let grnTotal = 0;
  const grnId = grns?.[0]?.id as string | undefined;
  const missingGrn = !grnId;

  if (grnId) {
    const { data: grnLines } = await supabase
      .from("vyron_cost_goods_receipt_lines")
      .select("received_qty, ordered_qty")
      .eq("goods_receipt_id", grnId);
    grnQty = (grnLines || []).reduce((s, l) => s + Number(l.received_qty || 0), 0);
    grnTotal = (poLines || []).reduce((s, l) => {
      const received = Number(l.received_qty || 0);
      return s + received * Number(l.unit_price || 0);
    }, 0);
  } else {
    grnQty = (poLines || []).reduce((s, l) => s + Number(l.received_qty || 0), 0);
    grnTotal = (poLines || []).reduce((s, l) => s + Number(l.received_qty || 0) * Number(l.unit_price || 0), 0);
  }

  const qtyVariance = round2(invoiceQty - poQty);
  const totalVariance = round2(invoiceTotal - poTotal);
  const avgPoPrice = poQty > 0 ? poTotal / poQty : 0;
  const avgInvoicePrice = invoiceQty > 0 ? invoiceTotal / invoiceQty : 0;
  const priceVariance = round2(avgInvoicePrice - avgPoPrice);

  let matchStatus: ThreeWayMatchStatus = "Matched";
  if (missingGrn && grnQty <= 0) matchStatus = "Missing GRN";
  else if (Math.abs(qtyVariance) > 0.01) matchStatus = "Quantity Variance";
  else if (Math.abs(totalVariance) > 1) matchStatus = "Price Variance";
  else if (Math.abs(qtyVariance) > 0 || Math.abs(totalVariance) > 0.01) matchStatus = "Partial Match";

  return {
    matchStatus,
    poQty: round2(poQty),
    invoiceQty: round2(invoiceQty),
    grnQty: round2(grnQty),
    qtyVariance,
    poTotal: round2(poTotal),
    invoiceTotal: round2(invoiceTotal),
    grnTotal: round2(grnTotal),
    totalVariance,
    priceVariance,
    missingPo: false,
    missingGrn: missingGrn && grnQty <= 0,
    details: {
      poNumber: po.po_number,
      grnId: grnId || null,
      lineCount: (poLines || []).length,
      invoiceLineCount: activeInvoiceLines.length,
    },
  };
}

export async function upsertThreeWayMatch(
  supabase: SupabaseClient,
  companyId: string,
  documentId: string,
  purchaseOrderId: string,
  result: ThreeWayMatchResult,
  goodsReceiptId?: string | null
) {
  const payload = {
    company_id: companyId,
    document_id: documentId,
    purchase_order_id: purchaseOrderId,
    goods_receipt_id: goodsReceiptId || null,
    match_status: result.matchStatus,
    po_qty: result.poQty,
    invoice_qty: result.invoiceQty,
    grn_qty: result.grnQty,
    qty_variance: result.qtyVariance,
    po_total: result.poTotal,
    invoice_total: result.invoiceTotal,
    grn_total: result.grnTotal,
    total_variance: result.totalVariance,
    price_variance: result.priceVariance,
    missing_po: result.missingPo,
    missing_grn: result.missingGrn,
    details: result.details,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("vyron_procurement_three_way_matches").upsert(payload, {
    onConflict: "document_id",
  });
  if (error) throw new Error(error.message);
}
