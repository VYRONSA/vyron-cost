/**
 * VYRON — automatic evidence capture for supplier invoice extraction.
 *
 * WHY THIS EXISTS
 * ---------------
 * Diagnosing the Gourmet Foods failure required re-running the document, because
 * nothing about the original run had been kept: the raw model output was
 * discarded, only a 2,000-character preview survived, and the crop the model
 * actually read did not exist yet. A production system should not need a live
 * re-extraction to explain a bad result — the re-run is billable, it is not
 * reproducible (the model returned different wrong values each time), and by
 * then the operator has already seen the wrong numbers.
 *
 * So every run that fails a deterministic check retains what an engineer would
 * need: what the model was shown, what it returned, what the validators made of
 * it, and how many attempts it took.
 *
 * NO SCHEMA CHANGE
 * ----------------
 * `vyron_document_extraction_logs.metadata` is already `jsonb`, and the document
 * storage bucket already exists. Structured evidence goes in the former, the
 * rendered crops in the latter under a `diagnostics/` prefix. Nothing is
 * migrated and no deployed code expects a column that is not there yet.
 *
 * RETENTION
 * ---------
 * Capture is deliberately conditional. A healthy extraction stores nothing
 * beyond today's success record; only runs that retried or failed a check pay
 * the storage cost, which is also exactly the set an engineer would ever open.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";
import {
  logExtractionEvent,
  type ExtractedInvoice,
  type ExtractionEvidence,
  type ExtractionRunLog,
  type ExtractionTokenUsage,
} from "@/lib/vyron-document-extraction";

export type ExtractionEvidenceTrigger =
  | "retry-occurred"
  | "arithmetic-failed"
  | "column-mapping-failed"
  | "extraction-incomplete"
  | "operator-reextract";

export type ExtractionMonitoringRecord = {
  visionClass: string | null;
  modelUsed: string | null;
  modelsAttempted: string[];
  attemptCount: number;
  retryCount: number;
  tableVisionUsed: boolean;
  tableVisionPages: number;
  arithmeticStatus: string;
  arithmeticCoherentRows: number;
  arithmeticCheckableRows: number;
  columnMappingFailed: boolean;
  completenessStatus: string;
  completenessReasons: string[];
  declaredLineItemCount: number | null;
  extractedLineItemCount: number;
  extractionDurationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  succeeded: boolean;
};

/**
 * The single definition of "this run needs to be explainable later".
 *
 * Exported so the monitoring record and the capture decision cannot drift apart:
 * anything that counts as a failure here is the same thing counted on the
 * dashboard.
 */
export function evidenceTriggers(input: {
  extraction: ExtractedInvoice;
  log: ExtractionRunLog;
  operatorReextract?: boolean;
}): ExtractionEvidenceTrigger[] {
  const triggers: ExtractionEvidenceTrigger[] = [];
  if (input.log.attempts.length > 1) triggers.push("retry-occurred");
  if (input.extraction.lineArithmetic.status === "Fail") triggers.push("arithmetic-failed");
  if (input.extraction.completeness.reasons.includes("column-mapping-failed")) {
    triggers.push("column-mapping-failed");
  }
  if (input.extraction.completeness.status === "Incomplete") triggers.push("extraction-incomplete");
  if (input.operatorReextract) triggers.push("operator-reextract");
  return triggers;
}

export function buildMonitoringRecord(input: {
  extraction: ExtractedInvoice;
  log: ExtractionRunLog;
  durationMs: number;
  usage: ExtractionTokenUsage | null;
}): ExtractionMonitoringRecord {
  const { extraction, log } = input;
  return {
    visionClass: log.visionClass,
    modelUsed: log.modelUsed,
    modelsAttempted: log.modelsAttempted,
    attemptCount: log.attempts.length,
    // The first attempt is not a retry; everything after it is.
    retryCount: Math.max(0, log.attempts.length - 1),
    tableVisionUsed: log.tableVision.length > 0,
    tableVisionPages: log.tableVision.length,
    arithmeticStatus: extraction.lineArithmetic.status,
    arithmeticCoherentRows: extraction.lineArithmetic.coherentRows,
    arithmeticCheckableRows: extraction.lineArithmetic.checkableRows,
    columnMappingFailed: extraction.completeness.reasons.includes("column-mapping-failed"),
    completenessStatus: extraction.completeness.status,
    completenessReasons: extraction.completeness.reasons,
    declaredLineItemCount: extraction.declaredLineItemCount,
    extractedLineItemCount: extraction.lineItems.length,
    extractionDurationMs: input.durationMs,
    promptTokens: input.usage?.promptTokens || 0,
    completionTokens: input.usage?.completionTokens || 0,
    totalTokens: input.usage?.totalTokens || 0,
    succeeded: extraction.completeness.status !== "Incomplete" && extraction.lineArithmetic.status !== "Fail",
  };
}

async function uploadCrops(
  supabase: SupabaseClient,
  documentId: string,
  crops: ExtractionEvidence["crops"]
): Promise<string[]> {
  const paths: string[] = [];

  for (const crop of crops) {
    const extension = crop.mime === "image/jpeg" ? "jpg" : "png";
    const path = `diagnostics/${documentId}/table-crop-p${crop.pageNumber}.${extension}`;
    const { error } = await supabase.storage
      .from(VYRON_DOCUMENTS_BUCKET)
      .upload(path, crop.bytes, { contentType: crop.mime, upsert: true });

    if (error) {
      // A crop that will not upload must not cost us the structured evidence,
      // which is the part that actually explains the failure.
      console.warn("[extraction-evidence] crop upload failed", { path, message: error.message });
      continue;
    }
    paths.push(path);
  }

  return paths;
}

/**
 * Persist the evidence for one extraction run, when it warrants it.
 *
 * Never throws. Evidence capture is diagnostics: it must not be able to fail an
 * extraction that has otherwise succeeded and been persisted.
 */
export async function captureExtractionEvidence(input: {
  supabase: SupabaseClient;
  documentId: string;
  extraction: ExtractedInvoice;
  log: ExtractionRunLog;
  evidence: ExtractionEvidence;
  modelUsed: string;
  durationMs: number;
  usage: ExtractionTokenUsage | null;
  operatorReextract?: boolean;
}): Promise<{ captured: boolean; triggers: ExtractionEvidenceTrigger[]; cropPaths: string[] }> {
  const triggers = evidenceTriggers({
    extraction: input.extraction,
    log: input.log,
    operatorReextract: input.operatorReextract,
  });
  const monitoring = buildMonitoringRecord({
    extraction: input.extraction,
    log: input.log,
    durationMs: input.durationMs,
    usage: input.usage,
  });

  if (!triggers.length) {
    // Healthy run: the metrics still go on the record so the dashboard has a
    // denominator, but none of the bulky material is retained.
    try {
      await logExtractionEvent(input.supabase, input.documentId, "monitoring", "Extraction metrics recorded.", {
        model: input.modelUsed,
        extractionMonitoring: monitoring,
      });
    } catch (error) {
      console.warn("[extraction-evidence] monitoring record failed", error);
    }
    return { captured: false, triggers, cropPaths: [] };
  }

  let cropPaths: string[] = [];
  try {
    cropPaths = await uploadCrops(input.supabase, input.documentId, input.evidence.crops);
  } catch (error) {
    console.warn("[extraction-evidence] crop upload stage failed", error);
  }

  try {
    await logExtractionEvent(
      input.supabase,
      input.documentId,
      "evidence",
      `Extraction evidence retained (${triggers.join(", ")}).`,
      {
        model: input.modelUsed,
        extractionMonitoring: monitoring,
        extractionEvidence: {
          triggers,
          capturedAt: new Date().toISOString(),
          visionClass: input.log.visionClass,
          visionReason: input.log.visionReason,
          tableVisionOutcome: input.log.tableVisionOutcome,
          // The untruncated model output for every attempt. This is the thing
          // whose absence forced a billable re-run during the investigation.
          rawResponses: input.evidence.rawResponses,
          tableVisionResponses: input.evidence.tableVisionResponses,
          tableVision: input.log.tableVision,
          retryHistory: input.log.attempts,
          arithmeticReport: input.extraction.lineArithmetic,
          completeness: input.extraction.completeness,
          normalizedExtraction: {
            supplier: input.extraction.supplier,
            invoiceNo: input.extraction.invoiceNo,
            invoiceDate: input.extraction.invoiceDate,
            subtotal: input.extraction.subtotal,
            vat: input.extraction.vat,
            total: input.extraction.total,
            currency: input.extraction.currency,
            documentType: input.extraction.documentType,
            lineItems: input.extraction.lineItems,
          },
          cropPaths,
          warnings: input.extraction.warnings,
        },
      }
    );
    return { captured: true, triggers, cropPaths };
  } catch (error) {
    console.warn("[extraction-evidence] evidence record failed", error);
    return { captured: false, triggers, cropPaths };
  }
}
