import { NextRequest, NextResponse } from "next/server";
import { deriveDateFormat, deriveInvoicePattern } from "@/lib/vyron-document-review";
import { persistSupplierLineMappings } from "@/lib/vyron-supplier-line-learning";
import {
  documentTenantAccessErrorResponse,
  requireDocumentTenantId,
  verifyDocumentTenantAccess,
} from "@/lib/vyron-document-tenant-access";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type LineInput = {
  id: string;
  description: string;
  quantity: number | null;
  unit: string;
  unitPrice: number | null;
  vat: number | null;
  lineTotal: number | null;
  skuOrProductCode: string;
  confidenceScore: number | null;
  fieldConfidence?: Record<string, number>;
  matchedEntityType: "ingredient" | "packaging" | "product" | null;
  matchedEntityId: string | null;
  matchedEntityName: string | null;
  ignored: boolean;
};

type CorrectionsPayload = {
  reconciliationNote?: string | null;
  fields: {
    supplierName: string | null;
    supplierVatNumber: string | null;
    customerName: string | null;
    customerVatNumber: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    purchaseOrderNumber: string | null;
    accountNumber: string | null;
    customerReference: string | null;
    salesRepresentative: string | null;
    subtotal: number | null;
    vat: number | null;
    total: number | null;
    currency: string | null;
    fieldConfidence?: Record<string, number>;
  };
  lines: LineInput[];
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const body = (await request.json()) as CorrectionsPayload;
  if (!body?.fields || !Array.isArray(body.lines)) {
    return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });
  }

  let tenantId: string;
  try {
    tenantId = await requireDocumentTenantId();
  } catch (error) {
    return documentTenantAccessErrorResponse(error);
  }

  const { data: existing, error: existingError } = await supabase
    .from("vyron_documents")
    .select("id, tenant_id, supplier_name, supplier_vat_number, customer_name, customer_vat_number, invoice_number, invoice_date, purchase_order_number, account_number, customer_reference, sales_representative, subtotal, vat, total, currency, deleted_at")
    .eq("id", documentId)
    .maybeSingle();
  if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  const denied = verifyDocumentTenantAccess(existing, tenantId);
  if (denied) return denied;
  if (existing.deleted_at) return NextResponse.json({ ok: false, error: "Document was deleted." }, { status: 404 });

  await supabase
    .from("vyron_documents")
    .update({
      supplier_name: body.fields.supplierName,
      supplier_vat_number: body.fields.supplierVatNumber,
      customer_name: body.fields.customerName,
      customer_vat_number: body.fields.customerVatNumber,
      invoice_number: body.fields.invoiceNumber,
      invoice_date: body.fields.invoiceDate,
      purchase_order_number: body.fields.purchaseOrderNumber,
      account_number: body.fields.accountNumber,
      customer_reference: body.fields.customerReference,
      sales_representative: body.fields.salesRepresentative,
      subtotal: body.fields.subtotal,
      vat: body.fields.vat,
      total: body.fields.total,
      currency: body.fields.currency || "ZAR",
      field_confidence: body.fields.fieldConfidence || {},
      reconciliation_note: body.reconciliationNote ?? null,
      status: "reviewed",
      processing_notes: "Corrections saved and supplier learning updated.",
    })
    .eq("id", documentId);

  const { data: existingLineRows, error: existingLinesError } = await supabase
    .from("vyron_document_line_items")
    .select("id")
    .eq("document_id", documentId);
  if (existingLinesError) {
    return NextResponse.json({ ok: false, error: existingLinesError.message }, { status: 500 });
  }
  const existingLineIds = new Set((existingLineRows || []).map((row) => String(row.id)));

  const correctedFieldCandidates: Array<[string, unknown, unknown]> = [
    ["supplier_name", existing.supplier_name, body.fields.supplierName],
    ["supplier_vat_number", existing.supplier_vat_number, body.fields.supplierVatNumber],
    ["customer_name", existing.customer_name, body.fields.customerName],
    ["customer_vat_number", existing.customer_vat_number, body.fields.customerVatNumber],
    ["invoice_number", existing.invoice_number, body.fields.invoiceNumber],
    ["invoice_date", existing.invoice_date, body.fields.invoiceDate],
    ["purchase_order_number", existing.purchase_order_number, body.fields.purchaseOrderNumber],
    ["account_number", existing.account_number, body.fields.accountNumber],
    ["customer_reference", existing.customer_reference, body.fields.customerReference],
    ["sales_representative", existing.sales_representative, body.fields.salesRepresentative],
    ["subtotal", existing.subtotal, body.fields.subtotal],
    ["vat", existing.vat, body.fields.vat],
    ["total", existing.total, body.fields.total],
  ];
  const correctedFields = correctedFieldCandidates.filter(
    ([, oldValue, newValue]) => String(oldValue ?? "") !== String(newValue ?? "")
  );

  if (correctedFields.length) {
    await supabase.from("vyron_document_field_corrections").insert(
      correctedFields.map(([field, originalValue, correctedValue]) => ({
        document_id: documentId,
        field_name: field,
        original_value: originalValue === null ? null : String(originalValue),
        corrected_value: correctedValue === null ? null : String(correctedValue),
      }))
    );
  }

  for (const line of body.lines) {
    const row = {
      description: line.description,
      quantity: line.quantity,
      unit: line.unit || null,
      unit_price: line.unitPrice,
      vat: line.vat,
      line_total: line.lineTotal,
      sku_product_code: line.skuOrProductCode || null,
      confidence_score: line.confidenceScore,
      field_confidence: line.fieldConfidence || {},
      matched_entity_type: line.matchedEntityType,
      matched_entity_id: line.matchedEntityId,
      matched_entity_name: line.matchedEntityName,
      ignored: line.ignored,
      mapping_confidence: line.matchedEntityId ? 90 : 0,
    };

    if (existingLineIds.has(line.id)) {
      await supabase.from("vyron_document_line_items").update(row).eq("id", line.id).eq("document_id", documentId);
    } else {
      await supabase.from("vyron_document_line_items").insert({
        ...row,
        id: line.id,
        document_id: documentId,
      });
    }
  }

  const supplierName = body.fields.supplierName || existing.supplier_name || "Unknown supplier";
  await supabase
    .from("vyron_supplier_invoice_learning")
    .upsert(
      {
        tenant_id: existing.tenant_id,
        supplier_name: supplierName,
        supplier_name_variations: [supplierName],
        invoice_number_pattern: deriveInvoicePattern(body.fields.invoiceNumber || null),
        date_format_hint: deriveDateFormat(body.fields.invoiceDate || null),
        common_line_item_descriptions: body.lines.slice(0, 100).map((l) => l.description),
        confidence_score: 80,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,supplier_name" }
    );

  await persistSupplierLineMappings(supabase, {
    tenantId: existing.tenant_id as string,
    supplierName,
    supplierVatNumber: body.fields.supplierVatNumber || existing.supplier_vat_number,
    documentId,
    approvedBy: "review-save-draft",
    isApproval: false,
    lines: body.lines.map((line) => ({
      description: line.description,
      skuOrProductCode: line.skuOrProductCode,
      unit: line.unit,
      unitPrice: line.unitPrice,
      matchedEntityType: line.matchedEntityType,
      matchedEntityId: line.matchedEntityId,
      matchedEntityName: line.matchedEntityName,
      ignored: line.ignored,
    })),
  });

  const mappedLines = body.lines.filter(
    (line) => line.matchedEntityType && line.matchedEntityId && !line.ignored
  ).length;

  return NextResponse.json({
    ok: true,
    correctedFieldCount: correctedFields.length,
    mappedLines,
    message: "Corrections saved and supplier mappings remembered for next invoice.",
  });
}

