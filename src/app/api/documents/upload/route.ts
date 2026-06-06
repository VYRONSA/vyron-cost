import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { lookupTenantById } from "@/lib/vyron-document-tenant";
import {
  buildDocumentStoragePath,
  isAllowedDocumentMime,
  VYRON_DEFAULT_TENANT_ID,
  VYRON_DOCUMENTS_BUCKET,
} from "@/lib/vyron-documents";
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
  const debugLog: Record<string, unknown> = {
    requestedTenantId: null as string | null,
    requestedTenantIdLength: 0,
    serviceRoleConfigured: isSupabaseServiceRoleConfigured(),
    supabaseConfigured: isSupabaseServerConfigured(),
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
    const file = formData.get("file");
    const requestedTenantId = String(formData.get("tenant_id") || VYRON_DEFAULT_TENANT_ID).trim();

    debugLog.requestedTenantId = requestedTenantId;
    debugLog.requestedTenantIdLength = requestedTenantId.length;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "No file uploaded. Use form field name 'file'.", debug: debugLog, failurePoint: "no_file" },
        { status: 400 }
      );
    }

    const mime = file.type || "application/octet-stream";
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

    console.log("[documents/upload] tenant lookup", JSON.stringify(debugLog, null, 2));

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

    const { error: insertError } = await supabase.from("vyron_documents").insert({
      id: documentId,
      tenant_id: tenantId,
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

    await logDocumentEvent(supabase, documentId, "upload", "success", "Document stored in Supabase Storage.", {
      storagePath,
      storageBucket: VYRON_DOCUMENTS_BUCKET,
    });

    return NextResponse.json({
      ok: true,
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
