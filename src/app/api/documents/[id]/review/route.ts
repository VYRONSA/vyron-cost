import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { getMatchOptions } from "@/lib/vyron-document-review";
import { findBestSupplierLineMatch, loadSupplierLineMappings } from "@/lib/vyron-supplier-line-learning";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const { data: document, error: docError } = await supabase
    .from("vyron_documents")
    .select(
      "id, tenant_id, supplier_name, supplier_vat_number, customer_name, customer_vat_number, invoice_number, invoice_date, purchase_order_number, purchase_order_id, account_number, customer_reference, sales_representative, subtotal, vat, total, currency, confidence, field_confidence, field_regions, page_count, status, deleted_at, reconciliation_note"
    )
    .eq("id", documentId)
    .maybeSingle();

  if (docError) return NextResponse.json({ ok: false, error: docError.message }, { status: 500 });
  if (!document) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  if (document.deleted_at) return NextResponse.json({ ok: false, error: "Document was deleted." }, { status: 404 });

  const { data: lines, error: lineError } = await supabase
    .from("vyron_document_line_items")
    .select("id, description, quantity, unit, unit_price, vat, line_total, sku_product_code, confidence_score, field_confidence, matched_entity_type, matched_entity_id, matched_entity_name, ignored, mapping_confidence, source_page, source_bbox")
    .eq("document_id", documentId)
    .order("created_at", { ascending: true });
  if (lineError) return NextResponse.json({ ok: false, error: lineError.message }, { status: 500 });

  const matchOptions = await getMatchOptions(supabase, document.tenant_id as string);
  const supplierMappings = await loadSupplierLineMappings(
    supabase,
    document.tenant_id as string,
    (document.supplier_name as string | null) ?? null
  );
  const enrichedLines = (lines || []).map((line: Record<string, unknown>) => ({
    ...line,
    suggested_match: findBestSupplierLineMatch(
      supplierMappings,
      String(line.description || ""),
      String(line.sku_product_code || ""),
      String(line.unit || "")
    ),
  }));

  return NextResponse.json({
    ok: true,
    payload: {
      document,
      lines: enrichedLines,
      matchOptions,
    },
  });
}

