import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerActiveWorkspace, getWorkspaceCompanyResolution } from "@/lib/vyron-workspace-server";
import { requireDocumentTenantId } from "@/lib/vyron-document-tenant-access";
import { loadSupplierInvoicePdfDocument, loadSupplierInvoicePdfFromUpload } from "@/lib/document-intelligence-v2/pdf-loader";
import { extractSupplierInvoiceWithOpenAI, extractSupplierInvoiceWithOpenAIDebug } from "@/lib/document-intelligence-v2/supplier-invoice-extractor";
import type { SupplierInvoiceExtraction, SupplierInvoiceExtractionDebugResult } from "@/lib/document-intelligence-v2/types";

export type SupplierInvoiceExtractionPipelineInput = {
  supabase: SupabaseClient;
  documentId: string;
  model?: string;
};

export type SupplierInvoiceExtractionPipelineContext = {
  workspaceId: string | null;
  companyId: string | null;
  tenantId: string;
};

export async function resolveSupplierInvoiceExtractionContext(): Promise<SupplierInvoiceExtractionPipelineContext> {
  const workspace = await getServerActiveWorkspace();
  const companyResolution = await getWorkspaceCompanyResolution();
  const tenantId = await requireDocumentTenantId();

  return {
    workspaceId: companyResolution.workspaceId || workspace?.id || null,
    companyId: companyResolution.companyId || null,
    tenantId,
  };
}

export async function runSupplierInvoiceExtractionPipelineV2(
  input: SupplierInvoiceExtractionPipelineInput
): Promise<SupplierInvoiceExtraction> {
  const context = await resolveSupplierInvoiceExtractionContext();
  const document = await loadSupplierInvoicePdfDocument(input.supabase, input.documentId, context.tenantId);
  return extractSupplierInvoiceWithOpenAI({
    fileName: document.fileName,
    bytes: document.bytes,
    mime: document.mime,
    model: input.model,
  });
}

export type SupplierInvoiceCertificationSummary = {
  pass: boolean;
  checks: {
    supplierExtracted: boolean;
    invoiceNumberExtracted: boolean;
    invoiceDateExtracted: boolean;
    totalsExtracted: boolean;
    vatExtracted: boolean;
    lineItemsExtracted: boolean;
    jsonValid: boolean;
    noNormalizationChangesRequired: boolean;
  };
};

export type SupplierInvoiceCertificationResult = {
  extraction: SupplierInvoiceExtraction;
  debug: SupplierInvoiceExtractionDebugResult;
  summary: SupplierInvoiceCertificationSummary;
};

export type SupplierInvoiceCertificationScores = {
  fieldAccuracyPercent: number;
  lineAccuracyPercent: number;
  financialAccuracyPercent: number;
  overallAccuracyPercent: number;
};

export type SupplierInvoiceCertificationInvoiceReport = {
  fileName: string;
  invoiceNumber: string | null;
  pdfValidation: "PASS" | "FAIL";
  documentClassification: {
    detectedType: string | null;
    confidence: number;
  };
  checks: {
    supplierExtraction: "PASS" | "FAIL";
    invoiceNumber: "PASS" | "FAIL";
    invoiceDate: "PASS" | "FAIL";
    purchaseOrder: "PASS" | "FAIL";
    vat: "PASS" | "FAIL";
    total: "PASS" | "FAIL";
    currency: "PASS" | "FAIL";
    jsonValid: "PASS" | "FAIL";
    noNormalizationChangesRequired: "PASS" | "FAIL";
  };
  lineItemCount: {
    expected: number;
    detected: number;
  };
  lineItems: Array<{
    description: string | null;
    quantity: string | null;
    unitPrice: string | null;
    vat: string | null;
    lineTotal: string | null;
  }>;
  scores: SupplierInvoiceCertificationScores;
  status: "PASS" | "FAIL";
  reason: string;
  debug: SupplierInvoiceExtractionDebugResult;
};

export type SupplierInvoiceCertificationFailureResponse = {
  invoiceNumber: string;
  failedFields: string[];
  rawOpenAiJson: Record<string, unknown>;
  validatedJson: SupplierInvoiceExtraction;
  normalizedJson: SupplierInvoiceExtraction;
  rootCause: string;
  smallestProductionGradeFix: string;
};

export type SupplierInvoiceBatchCertificationResult = {
  reports: SupplierInvoiceCertificationInvoiceReport[];
  consecutivePassCount: number;
  certified: boolean;
};

function hasText(value: string | null | undefined) {
  return Boolean(String(value || "").trim());
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function toPassFail(flag: boolean): "PASS" | "FAIL" {
  return flag ? "PASS" : "FAIL";
}

function countPasses(flags: boolean[]) {
  if (!flags.length) return 0;
  return flags.filter(Boolean).length;
}

function buildScores(input: {
  fieldChecks: boolean[];
  expectedLineCount: number;
  detectedLineCount: number;
  financialChecks: boolean[];
}) {
  const fieldAccuracyPercent = round2((countPasses(input.fieldChecks) / input.fieldChecks.length) * 100);

  const expected = Math.max(0, input.expectedLineCount);
  const detected = Math.max(0, input.detectedLineCount);
  const lineAccuracyPercent = expected > 0 ? round2((Math.min(expected, detected) / expected) * 100) : detected > 0 ? 100 : 0;

  const financialAccuracyPercent = round2((countPasses(input.financialChecks) / input.financialChecks.length) * 100);
  const overallAccuracyPercent = round2((fieldAccuracyPercent + lineAccuracyPercent + financialAccuracyPercent) / 3);

  return {
    fieldAccuracyPercent,
    lineAccuracyPercent,
    financialAccuracyPercent,
    overallAccuracyPercent,
  };
}

function rootCauseForFailure(report: SupplierInvoiceCertificationInvoiceReport) {
  const failedFields: string[] = [];
  if (report.pdfValidation === "FAIL") failedFields.push("PDF Validation");
  if (report.checks.supplierExtraction === "FAIL") failedFields.push("Supplier Extraction");
  if (report.checks.invoiceNumber === "FAIL") failedFields.push("Invoice Number");
  if (report.checks.invoiceDate === "FAIL") failedFields.push("Invoice Date");
  if (report.checks.purchaseOrder === "FAIL") failedFields.push("Purchase Order");
  if (report.checks.vat === "FAIL") failedFields.push("VAT");
  if (report.checks.total === "FAIL") failedFields.push("Total");
  if (report.checks.currency === "FAIL") failedFields.push("Currency");
  if (report.checks.jsonValid === "FAIL") failedFields.push("JSON Validation");
  if (report.checks.noNormalizationChangesRequired === "FAIL") failedFields.push("Normalization Integrity");
  if (report.lineItemCount.detected < report.lineItemCount.expected) failedFields.push("Line Item Count");

  let rootCause = "Model output did not meet required extraction thresholds for one or more critical invoice fields.";
  let fix = "Tighten extraction prompt examples for failing fields and enforce targeted schema constraints for the missing/invalid outputs.";

  if (failedFields.includes("JSON Validation")) {
    rootCause = "OpenAI response shape diverged from the required schema contract.";
    fix = "Add explicit schema-conformance retries with low-temperature fallback and strict error messaging for non-conforming responses.";
  } else if (failedFields.includes("Normalization Integrity")) {
    rootCause = "Normalization adjusted extracted content, indicating inconsistent raw output format.";
    fix = "Constrain model output formatting for date/number fields to match normalized representation directly so post-normalization is no-op.";
  } else if (failedFields.includes("Line Item Count")) {
    rootCause = "Line-item extraction under-detected invoice rows versus expected count.";
    fix = "Increase line-item extraction focus in prompt and add table continuation cues for multi-row invoice sections.";
  }

  return {
    failedFields,
    rootCause,
    smallestProductionGradeFix: fix,
  };
}

function buildCertificationSummary(debug: SupplierInvoiceExtractionDebugResult): SupplierInvoiceCertificationSummary {
  const extraction = debug.normalizedJson;
  const checks = {
    supplierExtracted: hasText(extraction.supplier),
    invoiceNumberExtracted: hasText(extraction.invoiceNo),
    invoiceDateExtracted: hasText(extraction.invoiceDate),
    totalsExtracted: typeof extraction.subtotal === "number" && typeof extraction.total === "number",
    vatExtracted: typeof extraction.vat === "number",
    lineItemsExtracted: extraction.lineItems.length > 0,
    jsonValid: true,
    noNormalizationChangesRequired: !debug.normalizationChanged,
  };

  const pass = Object.values(checks).every(Boolean);
  return { pass, checks };
}

export async function runSupplierInvoiceExtractionCertificationV2(input: {
  fileName: string;
  mime: string;
  bytes: Buffer;
  model?: string;
  expectedLineItemCount?: number;
}): Promise<SupplierInvoiceCertificationResult> {
  const loaded = loadSupplierInvoicePdfFromUpload({
    fileName: input.fileName,
    mime: input.mime,
    bytes: input.bytes,
  });

  const debug = await extractSupplierInvoiceWithOpenAIDebug({
    fileName: loaded.fileName,
    bytes: loaded.bytes,
    mime: loaded.mime,
    model: input.model,
  });

  const extraction = debug.normalizedJson;
  const expectedLineCount = Math.max(0, Number(input.expectedLineItemCount || 0));

  const supplierPass = hasText(extraction.supplier);
  const invoiceNoPass = hasText(extraction.invoiceNo);
  const invoiceDatePass = hasText(extraction.invoiceDate);
  const purchaseOrderPass = hasText(extraction.orderNo);
  const vatPass = typeof extraction.vat === "number";
  const totalPass = typeof extraction.total === "number";
  const currencyPass = hasText(extraction.currency);
  const lineCountPass = extraction.lineItems.length >= expectedLineCount;
  const jsonValidPass = true;
  const normalizationPass = !debug.normalizationChanged;

  const fieldChecks = [supplierPass, invoiceNoPass, invoiceDatePass, purchaseOrderPass, vatPass, totalPass, currencyPass, jsonValidPass, normalizationPass];
  const financialChecks = [vatPass, totalPass, typeof extraction.subtotal === "number"];

  const scores = buildScores({
    fieldChecks,
    expectedLineCount,
    detectedLineCount: extraction.lineItems.length,
    financialChecks,
  });

  const status = [...fieldChecks, lineCountPass].every(Boolean) ? "PASS" : "FAIL";
  const reason = status === "PASS" ? "All required extraction checks passed for this invoice." : "One or more required extraction checks failed.";

  const report: SupplierInvoiceCertificationInvoiceReport = {
    fileName: loaded.fileName,
    invoiceNumber: extraction.invoiceNo,
    pdfValidation: "PASS",
    documentClassification: {
      detectedType: extraction.documentType,
      confidence: extraction.confidence,
    },
    checks: {
      supplierExtraction: toPassFail(supplierPass),
      invoiceNumber: toPassFail(invoiceNoPass),
      invoiceDate: toPassFail(invoiceDatePass),
      purchaseOrder: toPassFail(purchaseOrderPass),
      vat: toPassFail(vatPass),
      total: toPassFail(totalPass),
      currency: toPassFail(currencyPass),
      jsonValid: toPassFail(jsonValidPass),
      noNormalizationChangesRequired: toPassFail(normalizationPass),
    },
    lineItemCount: {
      expected: expectedLineCount,
      detected: extraction.lineItems.length,
    },
    lineItems: extraction.lineItems.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vat: line.vatAmount,
      lineTotal: line.lineTotal,
    })),
    scores,
    status,
    reason,
    debug,
  };

  return {
    extraction,
    debug,
    summary: {
      pass: status === "PASS",
      checks: {
        supplierExtracted: supplierPass,
        invoiceNumberExtracted: invoiceNoPass,
        invoiceDateExtracted: invoiceDatePass,
        totalsExtracted: totalPass && typeof extraction.subtotal === "number",
        vatExtracted: vatPass,
        lineItemsExtracted: extraction.lineItems.length > 0,
        jsonValid: jsonValidPass,
        noNormalizationChangesRequired: normalizationPass,
      },
    },
  };
}

export async function runSupplierInvoiceBatchCertificationV2(input: {
  invoices: Array<{
    fileName: string;
    mime: string;
    bytes: Buffer;
    expectedLineItemCount?: number;
  }>;
  model?: string;
}): Promise<{ ok: true; result: SupplierInvoiceBatchCertificationResult } | { ok: false; failure: SupplierInvoiceCertificationFailureResponse }> {
  const reports: SupplierInvoiceCertificationInvoiceReport[] = [];
  let consecutivePassCount = 0;

  for (const invoice of input.invoices) {
    const single = await runSupplierInvoiceExtractionCertificationV2({
      fileName: invoice.fileName,
      mime: invoice.mime,
      bytes: invoice.bytes,
      model: input.model,
      expectedLineItemCount: invoice.expectedLineItemCount,
    });

    const extraction = single.extraction;
    const expectedLineCount = Math.max(0, Number(invoice.expectedLineItemCount || 0));
    const supplierPass = hasText(extraction.supplier);
    const invoiceNoPass = hasText(extraction.invoiceNo);
    const invoiceDatePass = hasText(extraction.invoiceDate);
    const purchaseOrderPass = hasText(extraction.orderNo);
    const vatPass = typeof extraction.vat === "number";
    const totalPass = typeof extraction.total === "number";
    const currencyPass = hasText(extraction.currency);
    const jsonValidPass = true;
    const normalizationPass = !single.debug.normalizationChanged;
    const lineCountPass = extraction.lineItems.length >= expectedLineCount;

    const report: SupplierInvoiceCertificationInvoiceReport = {
      fileName: invoice.fileName,
      invoiceNumber: extraction.invoiceNo,
      pdfValidation: "PASS",
      documentClassification: {
        detectedType: extraction.documentType,
        confidence: extraction.confidence,
      },
      checks: {
        supplierExtraction: toPassFail(supplierPass),
        invoiceNumber: toPassFail(invoiceNoPass),
        invoiceDate: toPassFail(invoiceDatePass),
        purchaseOrder: toPassFail(purchaseOrderPass),
        vat: toPassFail(vatPass),
        total: toPassFail(totalPass),
        currency: toPassFail(currencyPass),
        jsonValid: toPassFail(jsonValidPass),
        noNormalizationChangesRequired: toPassFail(normalizationPass),
      },
      lineItemCount: {
        expected: expectedLineCount,
        detected: extraction.lineItems.length,
      },
      lineItems: extraction.lineItems.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vat: line.vatAmount,
        lineTotal: line.lineTotal,
      })),
      scores: buildScores({
        fieldChecks: [supplierPass, invoiceNoPass, invoiceDatePass, purchaseOrderPass, vatPass, totalPass, currencyPass, jsonValidPass, normalizationPass],
        expectedLineCount,
        detectedLineCount: extraction.lineItems.length,
        financialChecks: [vatPass, totalPass, typeof extraction.subtotal === "number"],
      }),
      status: [supplierPass, invoiceNoPass, invoiceDatePass, purchaseOrderPass, vatPass, totalPass, currencyPass, jsonValidPass, normalizationPass, lineCountPass].every(Boolean)
        ? "PASS"
        : "FAIL",
      reason: [supplierPass, invoiceNoPass, invoiceDatePass, purchaseOrderPass, vatPass, totalPass, currencyPass, jsonValidPass, normalizationPass, lineCountPass].every(Boolean)
        ? "All required extraction checks passed for this invoice."
        : "One or more required extraction checks failed.",
      debug: single.debug,
    };

    if (report.status === "FAIL") {
      const failureMeta = rootCauseForFailure(report);
      return {
        ok: false,
        failure: {
          invoiceNumber: report.invoiceNumber || "UNKNOWN",
          failedFields: failureMeta.failedFields,
          rawOpenAiJson: report.debug.rawOpenAiJson,
          validatedJson: report.debug.validatedJson,
          normalizedJson: report.debug.normalizedJson,
          rootCause: failureMeta.rootCause,
          smallestProductionGradeFix: failureMeta.smallestProductionGradeFix,
        },
      };
    }

    reports.push(report);
    consecutivePassCount += 1;
  }

  return {
    ok: true,
    result: {
      reports,
      consecutivePassCount,
      certified: consecutivePassCount >= 10,
    },
  };
}
