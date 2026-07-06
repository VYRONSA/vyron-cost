import { NextRequest, NextResponse } from "next/server";
import { deleteVyronDocument } from "@/lib/vyron-document-delete";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; documentId: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id: productId, documentId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("products.delete");
    const companyId = await requireApiCompanyId();

    const { data: product, error: productError } = await supabase
      .from("vyron_cost_products")
      .select("id")
      .eq("id", productId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (productError) throw new Error(productError.message);
    if (!product) return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });

    const { data: document, error: docError } = await supabase
      .from("vyron_documents")
      .select("id, storage_bucket, storage_path, deleted_at")
      .eq("id", documentId)
      .eq("tenant_id", companyId)
      .eq("document_type", "product_attachment")
      .eq("customer_reference", productId)
      .maybeSingle();

    if (docError) throw new Error(docError.message);
    if (!document) return NextResponse.json({ ok: false, error: "Attachment not found." }, { status: 404 });

    const result = await deleteVyronDocument(supabase, {
      id: String(document.id),
      storage_bucket: document.storage_bucket ? String(document.storage_bucket) : null,
      storage_path: document.storage_path ? String(document.storage_path) : null,
      deleted_at: document.deleted_at ? String(document.deleted_at) : null,
    });

    if (result.error) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: result.action, storageArchived: result.storageArchived || false });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete attachment failed.");
  }
}
