import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";

export class DocumentTenantAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "DocumentTenantAccessError";
    this.status = status;
  }
}

/** Active workspace company — same as document tenant_id. Fails closed when unset. */
export async function requireDocumentTenantId(): Promise<string> {
  try {
    return await requireApiCompanyId();
  } catch (error) {
    const message = error instanceof Error ? error.message : "No active workspace company.";
    throw new DocumentTenantAccessError(message, 401);
  }
}

export function assertDocumentTenant(
  document: { tenant_id?: string | null } | null | undefined,
  tenantId: string
) {
  if (!document) throw new DocumentTenantAccessError("Document not found.", 404);
  if (String(document.tenant_id || "") !== tenantId) {
    throw new DocumentTenantAccessError("Access denied.", 403);
  }
}

export function verifyDocumentTenantAccess(
  document: { tenant_id?: string | null } | null | undefined,
  tenantId: string
): NextResponse | null {
  try {
    assertDocumentTenant(document, tenantId);
    return null;
  } catch (error) {
    return documentTenantAccessErrorResponse(error);
  }
}

export async function loadDocumentForTenant<T extends Record<string, unknown> = Record<string, unknown>>(
  supabase: SupabaseClient,
  documentId: string,
  tenantId: string,
  select: string
): Promise<T> {
  const { data: document, error } = await supabase
    .from("vyron_documents")
    .select(select)
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  assertDocumentTenant(document as { tenant_id?: string | null } | null, tenantId);
  return document as unknown as T;
}

export async function requireDocumentsForTenant<T extends Record<string, unknown> = Record<string, unknown>>(
  supabase: SupabaseClient,
  documentIds: string[],
  tenantId: string,
  select = "id, tenant_id"
): Promise<T[]> {
  if (!documentIds.length) return [];
  const { data: documents, error } = await supabase
    .from("vyron_documents")
    .select(select)
    .in("id", documentIds)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  if ((documents || []).length !== documentIds.length) {
    throw new DocumentTenantAccessError("One or more documents are not in the active company.", 403);
  }
  return (documents || []) as unknown as T[];
}

export function documentTenantAccessErrorResponse(error: unknown, fallbackMessage = "Request failed.") {
  if (error instanceof DocumentTenantAccessError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : fallbackMessage },
    { status: 500 }
  );
}
