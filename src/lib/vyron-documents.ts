export const VYRON_DOCUMENTS_BUCKET = "vyron-documents";

/** Default tenant for demo uploads (Handcrafted Food Products). */
export const VYRON_DEFAULT_TENANT_ID =
  process.env.VYRON_DEFAULT_TENANT_ID || "48002864-8800-4000-9000-000000000001";

export const VYRON_DOCUMENT_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
] as const;

export type VyronDocumentRow = {
  id: string;
  tenant_id: string;
  document_type: string;
  supplier_name: string | null;
  supplier_vat_number: string | null;
  customer_name: string | null;
  customer_vat_number: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  purchase_order_number: string | null;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  currency: string;
  confidence: number | null;
  status: string;
  storage_bucket: string;
  storage_path: string | null;
  original_filename: string | null;
  file_mime: string | null;
  file_size_bytes: number | null;
  created_at: string;
  updated_at: string;
};

export type VyronDocumentExtractionLogRow = {
  id: string;
  document_id: string;
  stage: string;
  status: string;
  model: string | null;
  message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export function sanitizeStorageFileName(fileName: string) {
  const base = fileName.split(/[/\\]/).pop() || "document";
  const cleaned = base.replace(/[^\w.\-()+ ]/g, "_").replace(/\s+/g, "_").slice(0, 180);
  return cleaned || "document";
}

export function buildDocumentStoragePath(tenantId: string, documentId: string, fileName: string) {
  return `${tenantId}/${documentId}/${sanitizeStorageFileName(fileName)}`;
}

export function isAllowedDocumentMime(mime: string) {
  return (VYRON_DOCUMENT_UPLOAD_MIME_TYPES as readonly string[]).includes(mime);
}
