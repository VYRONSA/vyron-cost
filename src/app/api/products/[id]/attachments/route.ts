import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildDocumentStoragePath, isAllowedDocumentMime, VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type RouteContext = { params: Promise<{ id: string }> };

async function ensureProductExists(productId: string, companyId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase unavailable.");

  const { data: product, error } = await supabase
    .from("vyron_cost_products")
    .select("id, product_name")
    .eq("id", productId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  return product;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: productId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("products.view");
    const companyId = await requireApiCompanyId();
    await ensureProductExists(productId, companyId);

    const { data, error } = await supabase
      .from("vyron_documents")
      .select("id, original_filename, file_mime, file_size_bytes, status, created_at")
      .eq("tenant_id", companyId)
      .eq("document_type", "product_attachment")
      .eq("customer_reference", productId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, attachments: data || [] });
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });
    }
    return workspaceAccessErrorResponse(error, "Load attachments failed.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: productId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("products.edit");
    const companyId = await requireApiCompanyId();
    const product = await ensureProductExists(productId, companyId);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file uploaded. Use form field name 'file'." }, { status: 400 });
    }

    const fileMime = file.type || "application/octet-stream";
    if (!isAllowedDocumentMime(fileMime)) {
      return NextResponse.json({ ok: false, error: "Only PDF, PNG, JPG, JPEG and WEBP files are supported." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "File exceeds 20MB upload limit." }, { status: 400 });
    }

    const documentId = randomUUID();
    const path = buildDocumentStoragePath(companyId, documentId, file.name);

    const { error: insertError } = await supabase.from("vyron_documents").insert({
      id: documentId,
      tenant_id: companyId,
      document_type: "product_attachment",
      status: "uploaded",
      storage_bucket: VYRON_DOCUMENTS_BUCKET,
      storage_path: path,
      original_filename: file.name,
      file_mime: fileMime,
      file_size_bytes: bytes.length,
      currency: "ZAR",
      customer_reference: productId,
      account_number: String((product as { product_name?: string }).product_name || ""),
      processing_notes: String(formData.get("notes") || "").trim() || null,
    });

    if (insertError) throw new Error(insertError.message);

    const { error: storageError } = await supabase.storage.from(VYRON_DOCUMENTS_BUCKET).upload(path, bytes, {
      contentType: fileMime,
      upsert: false,
    });

    if (storageError) {
      await supabase.from("vyron_documents").update({ status: "upload_failed" }).eq("id", documentId);
      throw new Error(storageError.message);
    }

    return NextResponse.json({
      ok: true,
      attachment: {
        id: documentId,
        original_filename: file.name,
        file_mime: fileMime,
        file_size_bytes: bytes.length,
        status: "uploaded",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });
    }
    return workspaceAccessErrorResponse(error, "Upload attachment failed.");
  }
}
