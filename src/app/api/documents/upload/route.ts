import { createHash } from "crypto";
import { traceStart, traceComplete } from "@/lib/vyron-workflow-trace";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { lookupTenantById } from "@/lib/vyron-document-tenant";
import {
  buildDocumentStoragePath,
  isAllowedDocumentMime,
  VYRON_DOCUMENTS_BUCKET,
} from "@/lib/vyron-documents";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  getSupabaseAdmin,
  isSupabaseServerConfigured,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

async function logDocumentEvent(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  documentId: string,
  stage: string,
  status: string,
  message: string,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from("vyron_document_extraction_logs").insert({
    document_id: documentId,
    stage,
    status,
    message,
    metadata,
  });
}

export async function POST(request: NextRequest) {
  traceStart("UPLOAD", null);
  const contentTypeHeader = request.headers.get("content-type") || "";
  const contentLengthHeader = request.headers.get("content-length");
  const boundaryMatch = contentTypeHeader.match(/boundary=([^;]+)/i);
  const multipartBoundary = boundaryMatch ? boundaryMatch[1] : null;

  const debugLog: Record<string, unknown> = {
    requestedTenantId: null as string | null,
    requestedTenantIdLength: 0,
    serviceRoleConfigured: isSupabaseServiceRoleConfigured(),
    supabaseConfigured: isSupabaseServerConfigured(),
    multipart: {
      contentType: contentTypeHeader || null,
      contentLength: contentLengthHeader ? Number(contentLengthHeader) : null,
      boundary: multipartBoundary,
    },
  };

  try {
    if (!isSupabaseServerConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
          debug: debugLog,
          failurePoint: "supabase_not_configured",
        },
        { status: 500 }
      );
    }

    if (!isSupabaseServiceRoleConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is missing or still a placeholder. Document upload requires the service role key because vyron_cost_companies is not readable with the anon key (RLS returns 0 rows). Add the service role key from Supabase → Project Settings → API, then restart Next.js.",
          debug: debugLog,
          failurePoint: "service_role_missing",
        },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        {
          ok: false,
          error: "Could not create Supabase admin client.",
          debug: debugLog,
          failurePoint: "admin_client_null",
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const clientFileSize = Number(String(formData.get("__client_file_size") || ""));
    const clientLastModified = Number(String(formData.get("__client_file_last_modified") || ""));
    const clientFileName = String(formData.get("__client_file_name") || "").trim() || null;
    const clientMime = String(formData.get("__client_file_mime") || "").trim() || null;

    const companyId = await requireApiCompanyId();
    const requestedTenantId = String(formData.get("tenant_id") || companyId).trim();
    if (requestedTenantId !== companyId) {
      return NextResponse.json(
        {
          ok: false,
          error: "tenant_id must match the active workspace company.",
          debug: debugLog,
          failurePoint: "tenant_mismatch",
        },
        { status: 403 }
      );
    }
    const file = formData.get("file");

    debugLog.requestedTenantId = requestedTenantId;
    debugLog.requestedTenantIdLength = requestedTenantId.length;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "No file uploaded. Use form field name 'file'.", debug: debugLog, failurePoint: "no_file" },
        { status: 400 }
      );
    }

    const mime = file.type || "application/octet-stream";

    const browserFileTrace = {
      executed: Number.isFinite(clientFileSize) && clientFileSize >= 0 ? "YES" : "NO",
      fileName: clientFileName || file.name,
      browserReportedSize: Number.isFinite(clientFileSize) ? clientFileSize : null,
      mimeType: clientMime || mime,
      lastModified: Number.isFinite(clientLastModified) ? clientLastModified : null,
    };

    debugLog.browserFile = browserFileTrace;
    debugLog.multipart = {
      contentType: contentTypeHeader || null,
      contentLength: contentLengthHeader ? Number(contentLengthHeader) : null,
      boundary: multipartBoundary,
      uploadedBytes: Number(contentLengthHeader) ? Number(contentLengthHeader) : null,
      executed: "YES",
    };

    if (!isAllowedDocumentMime(mime)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Only PDF, PNG, JPG, JPEG and WEBP documents are supported.",
          debug: debugLog,
          failurePoint: "invalid_mime",
        },
        { status: 400 }
      );
    }

    const lookup = await lookupTenantById(supabase, requestedTenantId);

    debugLog.allCompaniesCount = lookup.allCompaniesCount;
    debugLog.allCompaniesSample = lookup.allCompaniesSample;
    debugLog.exactTenantFound = Boolean(lookup.tenant);
    debugLog.exactTenantId = lookup.tenant?.id ?? null;
    debugLog.exactTenantName = lookup.tenant?.name ?? null;
    debugLog.queryError = lookup.error
      ? {
          message: lookup.error.message,
          code: lookup.error.code,
          details: lookup.error.details,
          hint: lookup.error.hint,
        }
      : null;

    if (lookup.error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Tenant query failed: ${lookup.error.message}`,
          debug: debugLog,
          failurePoint: "tenant_query_error",
        },
        { status: 500 }
      );
    }

    if (!lookup.tenant) {
      return NextResponse.json(
        {
          ok: false,
          error: `No company with id ${requestedTenantId}. API sees ${lookup.allCompaniesCount} row(s) in vyron_cost_companies with service role.`,
          debug: debugLog,
          failurePoint:
            lookup.allCompaniesCount === 0
              ? "zero_rows_visible_to_api_wrong_project_or_empty_db"
              : "uuid_not_found_among_visible_rows",
        },
        { status: 404 }
      );
    }

    const tenantId = lookup.tenant.id;
    const documentId = randomUUID();
    const storagePath = buildDocumentStoragePath(tenantId, documentId, file.name);
    const fileBytes = Buffer.from(await file.arrayBuffer());

    const apiTrace = {
      executed: "YES",
      fileName: file.name,
      mimeType: mime,
      fileSize: file.size,
      receivedByteCount: fileBytes.length,
      bufferLength: fileBytes.length,
      fileLength: fileBytes.length,
    };
    debugLog.apiUpload = apiTrace;

    /*
     * The content hash, and whether this tenant already has the same bytes.
     *
     * The same PDF was uploaded twice and extracted twice with nothing
     * noticing. Identical content is recognised here so the operator is told,
     * rather than the upload being blocked — re-uploading is often deliberate,
     * and file names get reused for genuinely different invoices, so the name
     * is not evidence of anything. The hash is scoped to the tenant, so one
     * company's documents never reveal another's.
     */
    const contentSha256 = createHash("sha256").update(fileBytes).digest("hex");
    const { data: alreadyUploaded } = await supabase
      .from("vyron_documents")
      .select("id, original_filename, created_at")
      .eq("tenant_id", tenantId)
      .eq("content_sha256", contentSha256)
      .is("deleted_at", null)
      .limit(1);
    const duplicateOf = (alreadyUploaded || [])[0] || null;

    const { error: insertError } = await supabase.from("vyron_documents").insert({
      id: documentId,
      tenant_id: tenantId,
      content_sha256: contentSha256,
      document_type: "pending_classification",
      status: "uploading",
      storage_bucket: VYRON_DOCUMENTS_BUCKET,
      storage_path: storagePath,
      original_filename: file.name,
      file_mime: mime,
      file_size_bytes: fileBytes.length,
      currency: "ZAR",
    });

    if (insertError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Could not create document record: ${insertError.message}. Run supabase/document-ai-v2-phase1.sql.`,
          debug: debugLog,
          failurePoint: "document_insert_error",
        },
        { status: 500 }
      );
    }

    await logDocumentEvent(supabase, documentId, "upload", "started", "Uploading file to storage.", {
      storagePath,
      fileName: file.name,
      mime,
      bytes: fileBytes.length,
    });

    const { error: storageError } = await supabase.storage
      .from(VYRON_DOCUMENTS_BUCKET)
      .upload(storagePath, fileBytes, {
        contentType: mime,
        upsert: false,
      });

    if (storageError) {
      await supabase.from("vyron_documents").update({ status: "upload_failed" }).eq("id", documentId);

      await logDocumentEvent(supabase, documentId, "upload", "failed", storageError.message, { storagePath });

      return NextResponse.json(
        {
          ok: false,
          error: `Storage upload failed: ${storageError.message}`,
          documentId,
          debug: debugLog,
          failurePoint: "storage_upload_error",
        },
        { status: 500 }
      );
    }

    await supabase
      .from("vyron_documents")
      .update({ status: "uploaded", storage_path: storagePath })
      .eq("id", documentId);

    const folder = storagePath.split("/").slice(0, -1).join("/");
    const objectName = storagePath.split("/").pop() || file.name;

    const { data: listedObjects } = await supabase.storage
      .from(VYRON_DOCUMENTS_BUCKET)
      .list(folder, { search: objectName, limit: 100 });
    const objectMeta = (listedObjects || []).find((row) => row.name === objectName) || null;

    const { data: storedBlob } = await supabase.storage.from(VYRON_DOCUMENTS_BUCKET).download(storagePath);
    const storedBytes = storedBlob ? Buffer.from(await storedBlob.arrayBuffer()) : null;

    const storageTrace = {
      executed: "YES",
      bytesWritten: fileBytes.length,
      storageObjectMetadata: objectMeta,
      contentType: objectMeta?.metadata?.mimetype || mime,
      storageSize: typeof objectMeta?.metadata?.size === "number" ? objectMeta.metadata.size : storedBytes?.length || null,
    };
    debugLog.storage = storageTrace;

    const browserSize = Number.isFinite(clientFileSize) ? clientFileSize : null;
    const apiSize = fileBytes.length;
    const storageSize = storageTrace.storageSize;

    let firstPointWhereSizeChanges: string | null = null;
    if (browserSize !== null && browserSize !== apiSize) {
      firstPointWhereSizeChanges = "Browser File Object -> API Upload Route";
    } else if (storageSize !== null && apiSize !== storageSize) {
      firstPointWhereSizeChanges = "API Upload Route -> Supabase Storage Upload";
    }

    debugLog.sizeComparison = {
      originalBrowserFileSize: browserSize,
      apiReceivedSize: apiSize,
      storageSize,
      firstPointWhereSizeChanges: firstPointWhereSizeChanges || "No size change detected",
    };

    await logDocumentEvent(supabase, documentId, "upload", "success", "Document stored in Supabase Storage.", {
      storagePath,
      storageBucket: VYRON_DOCUMENTS_BUCKET,
    });

    traceComplete("UPLOAD", documentId, { bytes: file.size, mime, storagePath });

    return NextResponse.json({
      ok: true,
      // Advisory only: the upload succeeded either way, and the operator
      // decides whether this one was meant.
      duplicateOfDocumentId: duplicateOf?.id ?? null,
      duplicateWarning: duplicateOf
        ? `This file was already uploaded as "${duplicateOf.original_filename}" on ${String(duplicateOf.created_at).slice(0, 10)}. Check it before extracting this copy.`
        : null,
      documentId,
      tenantId,
      tenantName: lookup.tenant.name,
      storageBucket: VYRON_DOCUMENTS_BUCKET,
      storagePath,
      originalFilename: file.name,
      fileMime: mime,
      fileSizeBytes: fileBytes.length,
      status: "uploaded",
      serviceRoleUsed: true,
      debug: debugLog,
      uploadTrace: {
        browserFile: browserFileTrace,
        multipart: debugLog.multipart,
        apiUpload: apiTrace,
        storage: storageTrace,
        sizeComparison: debugLog.sizeComparison,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown upload error.",
        debug: debugLog,
        failurePoint: "exception",
      },
      { status: 500 }
    );
  }
}
