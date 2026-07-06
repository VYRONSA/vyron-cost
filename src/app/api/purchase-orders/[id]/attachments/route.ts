import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildDocumentStoragePath, isAllowedDocumentMime, VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";
import { writeProcurementAudit } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type RouteContext = { params: Promise<{ id: string }> };

function companyContextFromRequest(request: NextRequest) {
  return {
    workspaceId: request.nextUrl.searchParams.get("workspaceId"),
    companyId: request.nextUrl.searchParams.get("companyId"),
  };
}

function companyContextFromFormData(formData: FormData) {
  return {
    workspaceId: String(formData.get("workspaceId") || "").trim() || null,
    companyId: String(formData.get("companyId") || "").trim() || null,
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: poId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.view");

    const companyId = await resolveApiCompanyIdWithContext(supabase, companyContextFromRequest(request));
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    const { data: po } = await supabase
      .from("vyron_cost_purchase_orders")
      .select("id")
      .eq("id", poId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!po) return NextResponse.json({ ok: false, error: "Purchase order not found." }, { status: 404 });

    const { data, error } = await supabase
      .from("vyron_documents")
      .select("id, original_filename, file_mime, file_size_bytes, status, created_at, processing_notes")
      .eq("tenant_id", companyId)
      .eq("purchase_order_id", poId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, attachments: data || [] });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load attachments failed.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: poId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.edit");

    const formData = await request.formData();
    const companyId = await resolveApiCompanyIdWithContext(supabase, companyContextFromFormData(formData));
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });

    const { data: po } = await supabase
      .from("vyron_cost_purchase_orders")
      .select("id, po_number")
      .eq("id", poId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!po) return NextResponse.json({ ok: false, error: "Purchase order not found." }, { status: 404 });

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
      document_type: String(formData.get("documentType") || "purchase_order_attachment"),
      status: "uploaded",
      storage_bucket: VYRON_DOCUMENTS_BUCKET,
      storage_path: path,
      original_filename: file.name,
      file_mime: fileMime,
      file_size_bytes: bytes.length,
      currency: "ZAR",
      purchase_order_id: poId,
      purchase_order_number: String(po.po_number),
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

    await writeProcurementAudit(supabase, {
      companyId,
      eventType: "PO Attachment Added",
      entityType: "purchase_order",
      entityId: poId,
      entityLabel: String(po.po_number),
      detail: `Attachment ${file.name} uploaded to ${po.po_number}.`,
      actor: String(formData.get("actor") || "user"),
      metadata: {
        document_id: documentId,
        file_name: file.name,
        file_mime: fileMime,
        bytes: bytes.length,
      },
    });

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
    return workspaceAccessErrorResponse(error, "Upload attachment failed.");
  }
}
