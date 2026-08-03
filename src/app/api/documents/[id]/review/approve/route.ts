import { NextRequest, NextResponse } from "next/server";
import { traceStart, traceComplete, traceEvent, traceReset } from "@/lib/vyron-workflow-trace";
import { getDocumentApprovalRules } from "@/lib/vyron-document-approval-rules";
import {
  recordApprovalOverride,
  recordPoLinkOverride,
  validateDocumentApproval,
  validatePoLinkRequired,
} from "@/lib/vyron-document-approval-validation";
import { updateStockCostsFromApprovedInvoice } from "@/lib/vyron-inventory";
import { getPoApprovalRules, writeProcurementAudit } from "@/lib/vyron-procurement";
import { computeThreeWayMatch, upsertThreeWayMatch } from "@/lib/vyron-three-way-match";
import { isSupervisorAuthorized } from "@/lib/vyron-document-approval-audit";
import { insertDocumentCostAudit } from "@/lib/vyron-document-cost-audit";
import { roundMoney } from "@/lib/vyron-invoice-line-math";
import { reconcileInvoiceTotals } from "@/lib/vyron-invoice-reconciliation";
import { recomputeRecoveryIntelligenceV2 } from "@/lib/vyron-recovery-intelligence-v2";
import { insertDocumentApprovalAudit } from "@/lib/vyron-document-approval-audit";
import { buildPriceHistoryRecord, changePercent, insertPriceHistoryRows } from "@/lib/vyron-price-history";
import { persistSupplierLineMappings } from "@/lib/vyron-supplier-line-learning";
import { queueXeroSupplierBill } from "@/lib/vyron-xero-integration";
import {
  documentTenantAccessErrorResponse,
  requireDocumentTenantId,
  verifyDocumentTenantAccess,
} from "@/lib/vyron-document-tenant-access";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { parseExtractionQualityRecord } from "@/lib/vyron-extraction-quality";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function movementType(previousValue: number, pct: number | null, hadPriorItem: boolean, isNewSupplier: boolean) {
  if (isNewSupplier) return "new_supplier";
  if (!hadPriorItem) return "new_item";
  if (!previousValue || previousValue <= 0) return "first_purchase";
  if ((pct || 0) > 0) return "price_increase";
  if ((pct || 0) < 0) return "price_decrease";
  return "first_purchase";
}

/**
 * The extraction quality record for a document's most recent successful run.
 *
 * Approval consults it so a failed extraction cannot become inventory cost.
 * Returns null when no record exists — documents extracted before extraction
 * quality shipped are validated on their fields alone, as they always were.
 */
async function loadExtractionQuality(supabase: SupabaseClient, documentId: string) {
  const { data, error } = await supabase
    .from('vyron_document_extraction_logs')
    .select('metadata')
    .eq('document_id', documentId)
    .eq('stage', 'extraction')
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.metadata || typeof data.metadata !== 'object') {
    traceEvent("QUALITY RECEIVED", documentId, { found: false, reason: error?.message ?? "no successful extraction log" });
    return null;
  }
  const record = parseExtractionQualityRecord((data.metadata as Record<string, unknown>).extractionQuality);
  traceEvent("QUALITY RECEIVED", documentId, {
    found: Boolean(record),
    completenessStatus: record?.completenessStatus ?? null,
    reconciliationStatus: record?.reconciliationStatus ?? null,
    columnMappingFailed: record?.columnMappingFailed ?? null,
    classification: record?.classification ?? null,
    extractedLineCount: record?.extractedLineCount ?? null,
  });
  return record;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;
  traceStart("APPROVAL", documentId);
  const body = await request.json().catch(() => ({}));
  const forceApproval = Boolean(body?.force);
  const forceTotalsMismatch = Boolean(body?.forceTotalsMismatch);
  const reconciliationNote = String(body?.reconciliationNote || "").trim() || null;
  const approvedBy = String(body?.approvedBy || "invoice-review").trim() || "invoice-review";
  const approvedAt = new Date().toISOString();
  const supervisorOverride = body?.supervisorOverride as
    | { pin?: string; reason?: string; overriddenBy?: string }
    | undefined;
  const overridePin = String(supervisorOverride?.pin || "");
  const overrideReason = String(supervisorOverride?.reason || "").trim();
  const hasSupervisorOverride = Boolean(overridePin && overrideReason && isSupervisorAuthorized(overridePin));
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  let tenantId: string;
  try {
    tenantId = await requireDocumentTenantId();
  } catch (error) {
    return documentTenantAccessErrorResponse(error);
  }

  const { data: document, error: docError } = await supabase
    .from("vyron_documents")
    .select("id, tenant_id, supplier_name, supplier_vat_number, currency, status, field_confidence, invoice_number, invoice_date, purchase_order_number, purchase_order_id, subtotal, vat, total")
    .eq("id", documentId)
    .maybeSingle();
  if (docError) return NextResponse.json({ ok: false, error: docError.message }, { status: 500 });
  if (!document) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  const denied = verifyDocumentTenantAccess(document, tenantId);
  if (denied) return denied;

  const rules = await getDocumentApprovalRules(supabase, tenantId);
  const poRules = await getPoApprovalRules(supabase, tenantId);

  const { data: lines, error: linesError } = await supabase
    .from("vyron_document_line_items")
    .select("id, description, quantity, unit, unit_price, vat, line_total, sku_product_code, matched_entity_type, matched_entity_id, matched_entity_name, ignored")
    .eq("document_id", documentId);
  if (linesError) return NextResponse.json({ ok: false, error: linesError.message }, { status: 500 });

  const policyRules = { ...rules, blockUnmappedLines: rules.requireMatchedLineItems };
  traceStart("APPROVAL VALIDATION", documentId);
  const validation = validateDocumentApproval({
    document,
    extractionQuality: await loadExtractionQuality(supabase, documentId),
    lines: lines || [],
    rules: policyRules,
    options: {
      forceApproval: forceApproval || hasSupervisorOverride,
      forceTotalsMismatch: forceTotalsMismatch || hasSupervisorOverride,
      hasSupervisorOverride,
    },
  });

  traceComplete("APPROVAL VALIDATION", documentId, { blocked: validation.blocked, violations: validation.violations.length, qualityRules: validation.violations.filter((v) => v.rule.startsWith("extraction_")).length, businessRules: validation.violations.filter((v) => !v.rule.startsWith("extraction_")).length });
  const poLinkViolation = validatePoLinkRequired(
    document.purchase_order_id as string | null,
    poRules.requirePoBeforeInvoiceApproval,
    hasSupervisorOverride
  );
  if (poLinkViolation) {
    validation.violations.push(poLinkViolation);
    validation.ok = false;
    validation.blocked = true;
    validation.requiresSupervisorOverride = true;
  }

  if (validation.blocked) {
    traceEvent("APPROVAL BLOCKED", documentId, { rules: validation.violations.map((v) => v.rule).join("|") });
    return NextResponse.json(
      {
        ok: false,
        error: "Approval blocked by company policy.",
        policyBlocked: true,
        validation,
        violations: validation.violations,
        requiresSupervisorOverride: validation.requiresSupervisorOverride,
      },
      { status: 400 }
    );
  }

  if (hasSupervisorOverride) {
    await recordApprovalOverride(supabase, {
      tenantId: document.tenant_id as string,
      documentId,
      overriddenBy: String(supervisorOverride?.overriddenBy || approvedBy),
      overrideReason,
      rulesBypassed: validation.violations.map((v) => v.rule),
      violations: validation.violations,
    });
    if (poLinkViolation) {
      await recordPoLinkOverride(supabase, {
        tenantId: document.tenant_id as string,
        documentId,
        overriddenBy: String(supervisorOverride?.overriddenBy || approvedBy),
        overrideReason,
      });
    }
  }

  const activeLines = (lines || []).filter((line: { ignored?: boolean }) => !line.ignored);
  const sumExcl = roundMoney(
    activeLines.reduce((sum: number, line: { quantity?: number | null; unit_price?: number | null }) => {
      const qty = Number(line.quantity || 0);
      const price = Number(line.unit_price || 0);
      return sum + qty * price;
    }, 0)
  );
  const sumVat = roundMoney(activeLines.reduce((sum: number, line: { vat?: number | null }) => sum + Number(line.vat || 0), 0));
  const sumIncl = roundMoney(
    activeLines.reduce((sum: number, line: { line_total?: number | null }) => sum + Number(line.line_total || 0), 0)
  );

  const extractedSubtotal = document.subtotal !== null ? Number(document.subtotal) : null;
  const extractedVat = document.vat !== null ? Number(document.vat) : null;
  const extractedTotal = document.total !== null ? Number(document.total) : null;

  // Same reconciliation the review screen and the validator use, so approval
  // cannot disagree with the panel the operator approved from.
  const reconciliation = reconcileInvoiceTotals({
    lineExclSum: sumExcl,
    lineVatSum: sumVat,
    lineTotalSum: sumIncl,
    extractedSubtotal,
    extractedVat,
    extractedTotal,
  });
  const totalsClass = {
    maxAbsDiff: reconciliation.maxAbsDiff,
    hasTotalsDifference: reconciliation.isRoundingDifference || reconciliation.isMajorMismatch,
  };
  const hasMajorMismatch =
    totalsClass.hasTotalsDifference && totalsClass.maxAbsDiff > rules.majorMismatchThreshold;
  const hasRoundingDifference =
    totalsClass.hasTotalsDifference &&
    totalsClass.maxAbsDiff > rules.roundingTolerance &&
    totalsClass.maxAbsDiff <= rules.majorMismatchThreshold;

  const totalsMismatch = hasMajorMismatch || hasRoundingDifference;

  const [{ data: supplier }, { data: priorSupplierRows }, { data: duplicateDocs }, { count: manualOverrideCount }] =
    await Promise.all([
      supabase
        .from("vyron_cost_suppliers")
        .select("id, supplier_name")
        .eq("company_id", document.tenant_id)
        .ilike("supplier_name", document.supplier_name || "")
        .maybeSingle(),
      supabase
        .from("vyron_supplier_price_history")
        .select("id")
        .eq("tenant_id", document.tenant_id)
        .eq("supplier_name", document.supplier_name || "")
        .limit(1),
      supabase
        .from("vyron_documents")
        .select("id", { count: "exact" })
        .eq("tenant_id", document.tenant_id)
        .eq("supplier_name", document.supplier_name || "")
        .eq("invoice_number", document.invoice_number || "")
        .eq("invoice_date", document.invoice_date || null)
        .eq("total", document.total || null)
        .neq("id", documentId),
      supabase
        .from("vyron_document_field_corrections")
        .select("*", { count: "exact", head: true })
        .eq("document_id", documentId),
    ]);

  const targetLines = (lines || []).filter((line: any) => !line.ignored && line.matched_entity_id);
  const historyRows: ReturnType<typeof buildPriceHistoryRecord>[] = [];
  const updatesApplied: any[] = [];
  const riskAlerts: any[] = [];
  const isNewSupplier = !priorSupplierRows || priorSupplierRows.length === 0;

  if ((duplicateDocs || []).length > 0) {
    riskAlerts.push({
      tenant_id: document.tenant_id,
      supplier_id: supplier?.id || null,
      supplier_name: document.supplier_name,
      document_id: documentId,
      risk_type: "duplicate_invoice",
      severity: "high",
      title: "Duplicate invoice detected",
      description: `Invoice ${document.invoice_number || "unknown"} appears duplicated for supplier ${document.supplier_name || "unknown"}.`,
      metadata: {
        duplicateDocumentIds: (duplicateDocs || []).map((d: any) => d.id),
      },
    });
  }

  if (!document.purchase_order_number) {
    riskAlerts.push({
      tenant_id: document.tenant_id,
      supplier_id: supplier?.id || null,
      supplier_name: document.supplier_name,
      document_id: documentId,
      risk_type: "missing_po_match",
      severity: "medium",
      title: "Missing PO match",
      description: "Document approved without a purchase order number match.",
      metadata: {},
    });
  }

  if ((manualOverrideCount || 0) >= rules.maxManualOverridesBeforeAlert) {
    riskAlerts.push({
      tenant_id: document.tenant_id,
      supplier_id: supplier?.id || null,
      supplier_name: document.supplier_name,
      document_id: documentId,
      risk_type: "repeated_manual_overrides",
      severity: "medium",
      title: "Repeated manual overrides",
      description: `This document has ${manualOverrideCount} field corrections before approval.`,
      metadata: { correctionCount: manualOverrideCount },
    });
  }

  for (const line of targetLines as any[]) {
    const newPrice = Number(line.unit_price || 0);

    if (line.matched_entity_type === "ingredient" || line.matched_entity_type === "packaging") {
      const { data: ingredient } = await supabase
        .from("vyron_cost_ingredients")
        .select("id, ingredient_name, purchase_cost")
        .eq("id", line.matched_entity_id)
        .maybeSingle();
      if (!ingredient) continue;
      const prev = Number(ingredient.purchase_cost || 0);
      const pct = changePercent(prev, newPrice);
      const { data: priorItemRows } = await supabase
        .from("vyron_supplier_price_history")
        .select("id")
        .eq("tenant_id", document.tenant_id)
        .eq("entity_type", line.matched_entity_type)
        .eq("entity_id", ingredient.id)
        .limit(1);
      const hadPriorItem = Boolean(priorItemRows && priorItemRows.length > 0);
      const moveType = movementType(prev, pct, hadPriorItem, isNewSupplier);

      historyRows.push(
        buildPriceHistoryRecord({
          tenantId: document.tenant_id as string,
          supplierId: supplier?.id || null,
          supplierName: document.supplier_name as string | null,
          invoiceNumber: document.invoice_number as string | null,
          invoiceDate: document.invoice_date as string | null,
          documentId,
          lineItemId: line.id,
          entityType: line.matched_entity_type,
          entityId: ingredient.id,
          entityName: ingredient.ingredient_name,
          itemDescription: String(line.description || ""),
          quantity: line.quantity,
          unit: line.unit,
          previousPrice: prev,
          newPrice,
          currency: document.currency || "ZAR",
          approvedBy,
          approvedAt,
          movementType: moveType,
        })
      );

      await supabase
        .from("vyron_cost_ingredients")
        .update({
          previous_cost: prev,
          purchase_cost: newPrice,
          true_unit_cost: newPrice,
          current_alert: pct !== null && Math.abs(pct) >= 1 ? `Invoice update ${pct > 0 ? "+" : ""}${pct.toFixed(2)}%` : null,
        })
        .eq("id", ingredient.id);

      updatesApplied.push({
        entityType: line.matched_entity_type,
        entityId: ingredient.id,
        entityName: ingredient.ingredient_name,
        previousPrice: prev,
        newPrice,
        changePercent: pct,
        movementType: moveType,
      });

      try {
        await insertDocumentCostAudit(supabase, {
          tenantId: document.tenant_id as string,
          documentId,
          lineItemId: line.id,
          supplierName: document.supplier_name,
          invoiceNumber: document.invoice_number,
          entityType: line.matched_entity_type,
          entityId: ingredient.id,
          entityName: ingredient.ingredient_name,
          previousCost: prev,
          newCost: newPrice,
          changePercent: pct,
          currency: document.currency || "ZAR",
          approvedBy,
        });
      } catch (auditError) {
        console.warn("[approve] cost audit insert failed", auditError);
      }

      if ((pct || 0) >= 12) {
        riskAlerts.push({
          tenant_id: document.tenant_id,
          supplier_id: supplier?.id || null,
          supplier_name: document.supplier_name,
          document_id: documentId,
          line_item_id: line.id,
          risk_type: "sudden_price_spike",
          severity: (pct || 0) >= 20 ? "high" : "medium",
          title: "Sudden price spike",
          description: `${ingredient.ingredient_name} increased by ${(pct || 0).toFixed(2)}%.`,
          previous_price: prev,
          new_price: newPrice,
          percentage_change: pct,
          metadata: { entityType: line.matched_entity_type, entityId: ingredient.id },
        });
      }
    } else if (line.matched_entity_type === "product") {
      const { data: product } = await supabase
        .from("vyron_cost_products")
        .select("id, product_name, total_cost")
        .eq("id", line.matched_entity_id)
        .maybeSingle();
      if (!product) continue;
      const prev = Number(product.total_cost || 0);
      const pct = changePercent(prev, newPrice);
      const { data: priorItemRows } = await supabase
        .from("vyron_supplier_price_history")
        .select("id")
        .eq("tenant_id", document.tenant_id)
        .eq("entity_type", "product")
        .eq("entity_id", product.id)
        .limit(1);
      const hadPriorItem = Boolean(priorItemRows && priorItemRows.length > 0);
      const moveType = movementType(prev, pct, hadPriorItem, isNewSupplier);

      historyRows.push(
        buildPriceHistoryRecord({
          tenantId: document.tenant_id as string,
          supplierId: supplier?.id || null,
          supplierName: document.supplier_name as string | null,
          invoiceNumber: document.invoice_number as string | null,
          invoiceDate: document.invoice_date as string | null,
          documentId,
          lineItemId: line.id,
          entityType: "product",
          entityId: product.id,
          entityName: product.product_name,
          itemDescription: String(line.description || ""),
          quantity: line.quantity,
          unit: line.unit,
          previousPrice: prev,
          newPrice,
          currency: document.currency || "ZAR",
          approvedBy,
          approvedAt,
          movementType: moveType,
        })
      );

      await supabase
        .from("vyron_cost_products")
        .update({
          total_cost: newPrice,
        })
        .eq("id", product.id);

      updatesApplied.push({
        entityType: "product",
        entityId: product.id,
        entityName: product.product_name,
        previousPrice: prev,
        newPrice,
        changePercent: pct,
        movementType: moveType,
      });

      try {
        await insertDocumentCostAudit(supabase, {
          tenantId: document.tenant_id as string,
          documentId,
          lineItemId: line.id,
          supplierName: document.supplier_name,
          invoiceNumber: document.invoice_number,
          entityType: "product",
          entityId: product.id,
          entityName: product.product_name,
          previousCost: prev,
          newCost: newPrice,
          changePercent: pct,
          currency: document.currency || "ZAR",
          approvedBy,
        });
      } catch (auditError) {
        console.warn("[approve] cost audit insert failed", auditError);
      }
    }
  }

  const pctChanges = updatesApplied
    .map((row) => Number(row.changePercent || 0))
    .filter((value) => Number.isFinite(value) && value !== 0);
  const avgPctIncrease =
    pctChanges.filter((value) => value > 0).reduce((sum, value) => sum + value, 0) /
    Math.max(1, pctChanges.filter((value) => value > 0).length);

  if (avgPctIncrease >= 9) {
    riskAlerts.push({
      tenant_id: document.tenant_id,
      supplier_id: supplier?.id || null,
      supplier_name: document.supplier_name,
      document_id: documentId,
      risk_type: "abnormal_supplier_increase",
      severity: avgPctIncrease >= 15 ? "high" : "medium",
      title: "Abnormal supplier increases",
      description: `Average positive movement across approved lines is ${avgPctIncrease.toFixed(2)}%.`,
      percentage_change: avgPctIncrease,
      metadata: { approvedLineCount: updatesApplied.length },
    });
  }

  if (riskAlerts.length >= 3) {
    riskAlerts.push({
      tenant_id: document.tenant_id,
      supplier_id: supplier?.id || null,
      supplier_name: document.supplier_name,
      document_id: documentId,
      risk_type: "high_risk_supplier",
      severity: "high",
      title: "High-risk supplier",
      description: `Supplier triggered ${riskAlerts.length} risk signals on this approval.`,
      metadata: { triggeredRiskCount: riskAlerts.length },
    });
  }

  if (historyRows.length) {
    await insertPriceHistoryRows(supabase, historyRows);
  }

  if (riskAlerts.length) {
    await supabase.from("vyron_procurement_risk_alerts").insert(riskAlerts);
  }

  await persistSupplierLineMappings(supabase, {
    tenantId: document.tenant_id as string,
    supplierName: String(document.supplier_name || "Unknown supplier"),
    supplierVatNumber: (document.supplier_vat_number as string | null) ?? null,
    documentId,
    approvedBy: "invoice-approval",
    isApproval: true,
    lines: (lines || []).map((line: Record<string, unknown>) => ({
      description: String(line.description || ""),
      skuOrProductCode: String(line.sku_product_code || ""),
      unit: String(line.unit || ""),
      unitPrice: line.unit_price !== null && line.unit_price !== undefined ? Number(line.unit_price) : null,
      matchedEntityType: (line.matched_entity_type as "ingredient" | "packaging" | "product" | null) ?? null,
      matchedEntityId: (line.matched_entity_id as string | null) ?? null,
      matchedEntityName: (line.matched_entity_name as string | null) ?? null,
      ignored: Boolean(line.ignored),
    })),
  });

  const approvalNotes = hasMajorMismatch
    ? `Approved with totals reconciliation. ${reconciliationNote || "No note provided."}`
    : hasRoundingDifference
      ? `Approved with rounding difference (within R${rules.majorMismatchThreshold.toFixed(2)}). ${reconciliationNote || ""}`.trim()
      : "Approved and cost updates applied.";

  try {
    await insertDocumentApprovalAudit(supabase, {
      tenantId: document.tenant_id as string,
      documentId,
      approvedBy,
      approvedAt,
      approvalNotes,
      reconciliationNote,
      previousStatus: String(document.status || "reviewed"),
      newStatus: "archived",
      headerSnapshot: {
        supplier_name: document.supplier_name,
        invoice_number: document.invoice_number,
        invoice_date: document.invoice_date,
        subtotal: document.subtotal,
        vat: document.vat,
        total: document.total,
        currency: document.currency,
      },
      linesSnapshot: (lines || []).map((line: Record<string, unknown>) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        matched_entity_type: line.matched_entity_type,
        matched_entity_id: line.matched_entity_id,
        matched_entity_name: line.matched_entity_name,
        ignored: line.ignored,
      })),
      costUpdatesCount: updatesApplied.length,
      priceHistoryCount: historyRows.length,
      metadata: { totalsMismatch, forceApproval, forceTotalsMismatch },
    });
  } catch (auditError) {
    console.warn("[approve] approval audit insert failed", auditError);
  }

  await supabase
    .from("vyron_documents")
    .update({
      status: "archived",
      approved_at: approvedAt,
      approved_by: approvedBy,
      archived_at: approvedAt,
      processed_at: approvedAt,
      reconciliation_note: hasMajorMismatch || hasRoundingDifference ? reconciliationNote : null,
      processing_notes: approvalNotes,
    })
    .eq("id", documentId);

  try {
    await updateStockCostsFromApprovedInvoice(supabase, {
      companyId: document.tenant_id as string,
      documentId,
      invoiceNumber: document.invoice_number as string | null,
      lines: (lines || []) as Array<{
        matched_entity_type?: string | null;
        matched_entity_id?: string | null;
        description?: string | null;
        unit_price?: number | null;
        ignored?: boolean;
      }>,
      actor: approvedBy,
    });
  } catch (invCostErr) {
    console.warn("[approve] inventory cost update failed", invCostErr);
  }

  if (document.purchase_order_id) {
    const invoiceTotal = Number(document.total || 0);
    await supabase
      .from("vyron_cost_purchase_orders")
      .update({
        invoice_total: invoiceTotal,
        updated_at: approvedAt,
      })
      .eq("id", document.purchase_order_id);
    try {
      const match = await computeThreeWayMatch(supabase, {
        companyId: document.tenant_id as string,
        documentId,
        purchaseOrderId: document.purchase_order_id as string,
      });
      await upsertThreeWayMatch(
        supabase,
        document.tenant_id as string,
        documentId,
        document.purchase_order_id as string,
        match
      );
      await supabase
        .from("vyron_cost_purchase_orders")
        .update({ match_status: match.matchStatus })
        .eq("id", document.purchase_order_id);
      await writeProcurementAudit(supabase, {
        companyId: document.tenant_id as string,
        eventType: "Invoice Approved",
        entityType: "document",
        entityId: documentId,
        entityLabel: document.purchase_order_number as string,
        detail: `Invoice approved against PO. 3-way match: ${match.matchStatus}.`,
        actor: approvedBy,
      });
    } catch (matchError) {
      console.warn("[approve] 3-way match update failed", matchError);
    }
  }

  let recoveryRecomputed = false;
  let recoveryRecomputeWarning: string | null = null;
  try {
    await recomputeRecoveryIntelligenceV2(document.tenant_id as string);
    recoveryRecomputed = true;
  } catch (recoveryError) {
    recoveryRecomputeWarning =
      recoveryError instanceof Error ? recoveryError.message : "Recovery intelligence refresh failed.";
  }

  try {
    await queueXeroSupplierBill(supabase, document.tenant_id as string, {
      documentId,
      invoiceNumber: document.invoice_number as string | null,
      supplierName: String(document.supplier_name || ""),
      total: Number(document.total || 0),
      invoiceDate: document.invoice_date as string | null,
    });
  } catch (xeroQueueError) {
    console.warn("[approve] Xero supplier bill queue failed", xeroQueueError);
  }

  traceEvent("APPROVAL INVENTORY", documentId, { costUpdates: updatesApplied.length, priceHistory: historyRows.length });
  traceComplete("APPROVAL", documentId, { updated: updatesApplied.length });
  traceEvent("FINISHED", documentId, { status: "approved" });
  traceReset(documentId);
  return NextResponse.json({
    ok: true,
    updatedCount: updatesApplied.length,
    historyCount: historyRows.length,
    riskAlertCount: riskAlerts.length,
    recoveryRecomputed,
    recoveryRecomputeWarning,
    updatesApplied,
    message: recoveryRecomputed
      ? "Approved. Costs, price history, and recovery intelligence updated."
      : "Approved. Costs and price history updated.",
  });
}

