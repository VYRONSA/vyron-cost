import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkspaceCompanyResolution, getServerActiveWorkspace } from "@/lib/vyron-workspace-server";
import { loadDocumentForTenant, requireDocumentTenantId } from "@/lib/vyron-document-tenant-access";
import { loadDocumentBytes } from "@/lib/vyron-document-extraction";
import { VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";
import type { SupplierInvoicePdfDocument, SupplierInvoiceUploadDocument } from "@/lib/document-intelligence-v2/types";

function isPdfHeader(bytes: Buffer) {
  return bytes.subarray(0, 5).toString("utf8") === "%PDF-";
}

export function loadSupplierInvoicePdfFromUpload(input: {
  fileName: string;
  mime: string;
  bytes: Buffer;
}): SupplierInvoiceUploadDocument {
  if (input.mime !== "application/pdf") {
    throw new Error("Only PDF files are supported for V2 certification.");
  }

  if (!input.bytes.length || !isPdfHeader(input.bytes)) {
    throw new Error("Uploaded file is not a valid PDF.");
  }

  const fileName = String(input.fileName || "supplier-invoice.pdf").trim() || "supplier-invoice.pdf";
  return {
    fileName,
    mime: "application/pdf",
    bytes: input.bytes,
  };
}

export async function loadSupplierInvoicePdfDocument(
  supabase: SupabaseClient,
  documentId: string,
  tenantId?: string
): Promise<SupplierInvoicePdfDocument> {
  const resolvedTenantId = tenantId || (await requireDocumentTenantId());
  const workspace = await getServerActiveWorkspace();
  const workspaceResolution = await getWorkspaceCompanyResolution();

  const document = await loadDocumentForTenant<{
    id: string;
    tenant_id: string;
    storage_bucket: string | null;
    storage_path: string | null;
    original_filename: string | null;
    file_mime: string | null;
  }>(
    supabase,
    documentId,
    resolvedTenantId,
    "id, tenant_id, storage_bucket, storage_path, original_filename, file_mime"
  );

  const { bytes, fileName, bucket, path } = await loadDocumentBytes(supabase, {
    storage_bucket: document.storage_bucket || VYRON_DOCUMENTS_BUCKET,
    storage_path: document.storage_path,
    original_filename: document.original_filename,
    file_mime: document.file_mime,
  });

  if (!isPdfHeader(bytes)) {
    throw new Error(`Document ${documentId} is not a valid PDF.`);
  }

  return {
    documentId,
    tenantId: resolvedTenantId,
    workspaceId: workspaceResolution.workspaceId || workspace?.id || null,
    fileName,
    mime: "application/pdf",
    bucket,
    path,
    bytes,
  };
}
