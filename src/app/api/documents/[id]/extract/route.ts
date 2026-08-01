import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import {
  loadDocumentBytes,
  logExtractionEvent,
  persistExtractionToDocument,
  type ExtractionTraceEvent,
  runDocumentExtraction,
} from "@/lib/vyron-document-extraction";
import {
  documentTenantAccessErrorResponse,
  loadDocumentForTenant,
  requireDocumentTenantId,
} from "@/lib/vyron-document-tenant-access";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { getServerActiveWorkspace, getWorkspaceCompanyResolution } from "@/lib/vyron-workspace-server";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import { AiUsageService, resolveProviderForModel } from "@/lib/platform/ai";
import { computeDocumentHash, runDuplicateInvoiceDetection } from "@/lib/vyron-duplicate-invoice-detection";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

function first100Hex(bytes: Buffer) {
  return bytes.subarray(0, 100).toString("hex");
}

function first100Readable(bytes: Buffer) {
  return bytes
    .subarray(0, 100)
    .toString("utf8")
    .replace(/[^\x20-\x7E]/g, ".");
}

function runtimeLog(event: ExtractionTraceEvent & { documentId: string }) {
  console.log("[documents/extract/runtime]", JSON.stringify(event));
}

function createRouteTracer(documentId: string) {
  return {
    log(step: string, input: Record<string, unknown> | null, output: Record<string, unknown> | null, durationMs = 0) {
      runtimeLog({
        timestamp: new Date().toISOString(),
        step,
        input,
        output,
        durationMs,
        documentId,
      });
    },
    error(step: string, error: unknown, context: Record<string, unknown> = {}) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[documents/extract/runtime]", JSON.stringify({
        timestamp: new Date().toISOString(),
        step,
        input: context,
        output: {
          name: err.name,
          message: err.message,
        },
        durationMs: 0,
        documentId,
      }));
      console.error(err.stack || err.message);
    },
  };
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;
  const trace = createRouteTracer(documentId);
  trace.log("Route entered", { documentId, method: "POST" }, { runtime, maxDuration }, 0);

  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required for document extraction." },
      { status: 500 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin client unavailable." }, { status: 500 });
  }

  try {
    const workspaceStartedAt = Date.now();
    const workspace = await getServerActiveWorkspace();
    trace.log(
      "Workspace resolved",
      { documentId },
      {
        workspaceId: workspace?.id || null,
        workspaceName: workspace?.companyName || workspace?.tradingName || null,
        demoMode: workspace?.demoMode ?? null,
      },
      Date.now() - workspaceStartedAt
    );

    const companyStartedAt = Date.now();
    const companyResolution = await getWorkspaceCompanyResolution();
    trace.log(
      "Company resolved",
      { workspaceId: workspace?.id || null },
      {
        workspaceId: companyResolution.workspaceId,
        companyId: companyResolution.companyId,
        source: companyResolution.source,
      },
      Date.now() - companyStartedAt
    );

    const tenantId = await requireDocumentTenantId();
    const runtimeContext = {
      documentId,
      workspaceId: companyResolution.workspaceId || workspace?.id || null,
      companyId: tenantId,
    };

    // Entitlement is resolved from the database inside checkAllowance. The
    // session cookie is deliberately NOT consulted — it is client-controlled
    // and must never determine licensing.
    const allowanceCheck = await AiUsageService.checkAllowance({ companyId: tenantId });
    if (!allowanceCheck.allowed) {
      trace.log(
        "AI allowance exceeded",
        { companyId: tenantId },
        {
          packageName: allowanceCheck.packageName,
          packageSource: allowanceCheck.packageSource,
          percentOfLimitUsed: allowanceCheck.percentOfLimitUsed,
          creditsUsed: allowanceCheck.creditsUsed,
          creditsLimit: allowanceCheck.creditsLimit,
          requestsUsed: allowanceCheck.requestsUsed,
          requestsLimit: allowanceCheck.requestsLimit,
        },
        0
      );
      return NextResponse.json(
        {
          ok: false,
          error: "AI_ALLOWANCE_EXCEEDED",
          message: "You have reached your monthly AI allowance. Upgrade your subscription to continue using AI features.",
          check: allowanceCheck,
        },
        { status: 402 }
      );
    }

    const documentStartedAt = Date.now();
    const document = await loadDocumentForTenant<{
      id: string;
      tenant_id: string;
      status: string;
      storage_bucket: string;
      storage_path: string;
      original_filename: string;
      file_mime: string | null;
      file_size_bytes: number | null;
      deleted_at: string | null;
    }>(
      supabase,
      documentId,
      tenantId,
      "id, tenant_id, status, storage_bucket, storage_path, original_filename, file_mime, file_size_bytes, deleted_at"
    );
    trace.log(
      "Document loaded",
      { documentId, tenantId },
      {
        status: document.status,
        tenantId: document.tenant_id,
        storageBucket: document.storage_bucket,
        storagePath: document.storage_path,
        fileName: document.original_filename,
        mime: document.file_mime,
        fileSizeBytes: document.file_size_bytes,
        deletedAt: document.deleted_at,
      },
      Date.now() - documentStartedAt
    );

    if (document.deleted_at) {
      return NextResponse.json({ ok: false, error: `Document ${documentId} was deleted.` }, { status: 404 });
    }

    const extractingUpdateStartedAt = Date.now();
    const { data: extractingRows, error: extractingUpdateError } = await supabase
      .from("vyron_documents")
      .update({ status: "extracting" })
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .select("id");
    if (extractingUpdateError) {
      throw new Error(`Could not mark document extracting: ${extractingUpdateError.message}`);
    }
    if (!extractingRows?.length) {
      console.error("[documents/extract/runtime] Database update affected 0 rows", {
        timestamp: new Date().toISOString(),
        sql: "update vyron_documents set status = 'extracting' where id = :documentId and tenant_id = :tenantId",
        where: { id: documentId, tenant_id: tenantId },
        workspaceId: runtimeContext.workspaceId,
        companyId: runtimeContext.companyId,
        documentId,
      });
    }
    trace.log(
      "Database update started",
      {
        table: "vyron_documents",
        operation: "mark_extracting",
        where: { id: documentId, tenant_id: tenantId },
      },
      {
        affectedRows: extractingRows?.length || 0,
      },
      Date.now() - extractingUpdateStartedAt
    );

    trace.log(
      "Storage download started",
      {
        executed: "YES",
        bucket: document.storage_bucket,
        path: document.storage_path,
        fileName: document.original_filename,
        mimeType: document.file_mime,
        byteSize: document.file_size_bytes,
        first100Bytes: "N/A (object metadata stage)",
      },
      null,
      0
    );
    const storageStartedAt = Date.now();
    const { bytes, mime, fileName, bucket, path } = await loadDocumentBytes(supabase, document);
    trace.log(
      "Storage download completed",
      {
        executed: "YES",
        bucket,
        path,
        mimeType: mime,
      },
      {
        fileName,
        mime,
        byteSize: bytes.length,
        first100Bytes: first100Hex(bytes),
        first100Readable: first100Readable(bytes),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      Date.now() - storageStartedAt
    );

    trace.log(
      "Downloaded bytes prepared",
      {
        executed: "YES",
        bucket,
        path,
        mimeType: mime,
        byteSize: bytes.length,
      },
      {
        first100Bytes: first100Hex(bytes),
        first100Readable: first100Readable(bytes),
      },
      0
    );

    trace.log(
      "Upload/download byte comparison",
      {
        executed: "YES",
        originalUploadByteSize: document.file_size_bytes,
        downloadedByteSize: bytes.length,
        mimeType: mime,
      },
      {
        identical: typeof document.file_size_bytes === "number" ? (document.file_size_bytes === bytes.length ? "YES" : "NO") : "UNKNOWN",
        first100Bytes: first100Hex(bytes),
      },
      0
    );

    console.log("[documents/extract] loaded from storage", {
      documentId,
      fileName,
      mime,
      byteSize: bytes.length,
      bucket,
      path,
    });

    await logExtractionEvent(supabase, documentId, "started", "Downloaded file from storage; calling OpenAI.", {
      fileName,
      mime,
      byteSize: bytes.length,
      bucket,
      path,
    });

    trace.log(
      "OCR invoked",
      {
        fileName,
        mime,
        byteSize: bytes.length,
      },
      {
        implementation: "No separate OCR service in this runtime; multimodal extraction continues in OpenAI pipeline.",
      },
      0
    );
    trace.log(
      "OCR returned",
      {
        implementation: "pass-through",
      },
      {
        implementation: "No standalone OCR response; downstream stages emit OpenAI and JSON logs.",
      },
      0
    );

    const aiUsageAttributionStartedAt = Date.now();
    const session = await getServerWorkspaceSession();
    trace.log("AI usage attribution resolved", null, { userId: session?.userId || null }, Date.now() - aiUsageAttributionStartedAt);

    let extraction: Awaited<ReturnType<typeof runDocumentExtraction>>["extraction"];
    let modelUsed: string;
    let log: Awaited<ReturnType<typeof runDocumentExtraction>>["log"];
    try {
      const result = await runDocumentExtraction(
        { fileName, mime, bytes },
        {
          context: runtimeContext,
          onTrace: (event) => trace.log(event.step, event.input, event.output, event.durationMs),
        }
      );
      extraction = result.extraction;
      modelUsed = result.modelUsed;
      log = result.log;

      await AiUsageService.recordUsage({
        companyId: tenantId,
        workspaceId: runtimeContext.workspaceId,
        userId: session?.userId || null,
        productId: "vyron_cost",
        featureId: "document_intelligence",
        provider: resolveProviderForModel(modelUsed),
        model: modelUsed,
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
        executionTimeMs: result.executionTimeMs,
        success: true,
      });
    } catch (extractionError) {
      await AiUsageService.recordUsage({
        companyId: tenantId,
        workspaceId: runtimeContext.workspaceId,
        userId: session?.userId || null,
        productId: "vyron_cost",
        featureId: "document_intelligence",
        provider: "openai",
        model: "unknown",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        executionTimeMs: 0,
        success: false,
        errorMessage: extractionError instanceof Error ? extractionError.message : "Extraction failed.",
      });
      throw extractionError;
    }

    trace.log(
      "Database update started",
      {
        table: "vyron_documents",
        operation: "persist_extraction",
        where: { id: documentId },
        modelUsed,
      },
      null,
      0
    );

    // Content identity for duplicate Layer 2, computed from the bytes actually
    // extracted. Persisted best-effort so later uploads can be compared against
    // it; deployments without the column simply keep Layer 2 unavailable.
    const documentFileHash = computeDocumentHash(bytes);
    const { error: hashPersistError } = await supabase
      .from("vyron_documents")
      .update({ file_hash: documentFileHash })
      .eq("id", documentId);
    if (hashPersistError && !/file_hash/i.test(hashPersistError.message)) {
      console.warn("[documents/extract] could not persist file_hash", hashPersistError.message);
    }

    await persistExtractionToDocument(supabase, documentId, extraction, modelUsed, {
      context: runtimeContext,
      onTrace: (event) => trace.log(event.step, event.input, event.output, event.durationMs),
    });

    // Deterministic duplicate detection. Runs AFTER persistence so the header
    // fields it compares are the ones stored. No model output influences the
    // verdict — `extraction.validation.duplicateRisk` is deliberately ignored.
    // Never allowed to fail the extraction.
    let duplicateResult: Awaited<ReturnType<typeof runDuplicateInvoiceDetection>> | null = null;
    try {
      const duplicateStartedAt = Date.now();
      const { data: storedDocument } = await supabase
        .from("vyron_documents")
        .select("id, tenant_id, supplier_id, supplier_name, invoice_number, invoice_date, total")
        .eq("id", documentId)
        .maybeSingle();

      if (storedDocument?.tenant_id) {
        duplicateResult = await runDuplicateInvoiceDetection(supabase, {
          documentId,
          tenantId: String(storedDocument.tenant_id),
          supplierId: (storedDocument.supplier_id as string | null) || null,
          supplierName: (storedDocument.supplier_name as string | null) || null,
          invoiceNumber: (storedDocument.invoice_number as string | null) || null,
          invoiceDate: (storedDocument.invoice_date as string | null) || null,
          total: storedDocument.total == null ? null : Number(storedDocument.total),
          fileHash: documentFileHash,
        });

        trace.log(
          "Duplicate invoice detection completed",
          { documentId, layers: ["supplier-invoice-number", "document-hash", "date-total", "operator-review"] },
          {
            isDuplicate: duplicateResult.isDuplicate,
            action: duplicateResult.action,
            matches: duplicateResult.matches.length,
            hashLayerUnavailable: duplicateResult.hashLayerUnavailable,
          },
          Date.now() - duplicateStartedAt
        );
      }
    } catch (duplicateError) {
      trace.log(
        "Duplicate invoice detection skipped",
        { documentId },
        { reason: duplicateError instanceof Error ? duplicateError.message : String(duplicateError) },
        0
      );
    }

    trace.log(
      "Review draft updated",
      {
        documentId,
      },
      {
        source: "Review draft is derived from persisted vyron_documents and vyron_document_line_items rows.",
        status: "ready_for_review_reload",
        lineItems: extraction.lineItems.length,
      },
      0
    );

    trace.log(
      "HTTP response returned",
      {
        documentId,
      },
      {
        ok: true,
        modelUsed,
        lineItems: extraction.lineItems.length,
      },
      0
    );

    return NextResponse.json({
      ok: true,
      documentId,
      modelUsed,
      extraction,
      log,
      // Additive. Existing consumers ignore it; the document inbox reads the
      // persisted risk alert rather than this field.
      duplicateDetection: duplicateResult,
    });
  } catch (error) {
    trace.error("Unhandled exception", error, { documentId });
    return documentTenantAccessErrorResponse(error, "Extraction failed.");
  }
}
