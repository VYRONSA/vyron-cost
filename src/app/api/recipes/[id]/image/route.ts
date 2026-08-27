import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { buildDocumentStoragePath, VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

/** Photographs only — the document uploader's PDF option makes no sense here. */
const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"] as const;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 10;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The BOM is always re-read against the company resolved from the verified
 * workspace, so a caller cannot reach another tenant's recipe — or its photo —
 * by guessing a BOM id.
 */
async function requireBom(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, recipeId: string, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_boms")
    .select("id, bom_name, image_bucket, image_path, image_mime")
    .eq("id", recipeId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("BOM_NOT_FOUND");
  return data as {
    id: string;
    bom_name: string;
    image_bucket: string | null;
    image_path: string | null;
    image_mime: string | null;
  };
}

const notFound = () => NextResponse.json({ ok: false, error: "Recipe not found." }, { status: 404 });

/** Returns a short-lived signed URL; the bucket itself stays private. */
export async function GET(_request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await context.params;
  try {
    await requireWorkspacePermission("boms.view");
    const companyId = await requireApiCompanyId();
    const bom = await requireBom(supabase, id, companyId);
    if (!bom.image_path) return NextResponse.json({ ok: true, image: null });

    const { data: signed, error } = await supabase.storage
      .from(bom.image_bucket || VYRON_DOCUMENTS_BUCKET)
      .createSignedUrl(bom.image_path, SIGNED_URL_TTL_SECONDS);
    if (error || !signed?.signedUrl) {
      return NextResponse.json({ ok: false, error: error?.message || "Could not read the image." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, image: { url: signed.signedUrl, mime: bom.image_mime } });
  } catch (error) {
    if (error instanceof Error && error.message === "BOM_NOT_FOUND") return notFound();
    return workspaceAccessErrorResponse(error, "Load image failed.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await context.params;
  try {
    await requireWorkspacePermission("boms.edit");
    const companyId = await requireApiCompanyId();
    const bom = await requireBom(supabase, id, companyId);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Choose an image to upload." }, { status: 400 });
    }

    const mime = String(file.type || "").toLowerCase();
    if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) {
      return NextResponse.json(
        { ok: false, error: "Only JPG, JPEG, PNG and WEBP images are supported." },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ ok: false, error: "Image must be 8MB or smaller." }, { status: 400 });
    }

    // Tenant-prefixed path, same convention as every other upload in the app.
    const path = buildDocumentStoragePath(companyId, `bom-${id}-${randomUUID()}`, file.name);
    const { error: uploadError } = await supabase.storage
      .from(VYRON_DOCUMENTS_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { error: updateError } = await supabase
      .from("vyron_cost_boms")
      .update({ image_bucket: VYRON_DOCUMENTS_BUCKET, image_path: path, image_mime: mime })
      .eq("id", id)
      .eq("company_id", companyId);
    if (updateError) {
      // Never leave an orphan object behind if the reference could not be saved.
      await supabase.storage.from(VYRON_DOCUMENTS_BUCKET).remove([path]);
      throw new Error(updateError.message);
    }

    // Replacing a photo removes the one it replaced, once the new one is safely referenced.
    if (bom.image_path && bom.image_path !== path) {
      await supabase.storage.from(bom.image_bucket || VYRON_DOCUMENTS_BUCKET).remove([bom.image_path]);
    }

    const { data: signed } = await supabase.storage
      .from(VYRON_DOCUMENTS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return NextResponse.json({ ok: true, image: { url: signed?.signedUrl ?? null, mime } });
  } catch (error) {
    if (error instanceof Error && error.message === "BOM_NOT_FOUND") return notFound();
    return workspaceAccessErrorResponse(error, "Image upload failed.");
  }
}

/** Removes the photo only. The recipe, its lines and its costs are untouched. */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const { id } = await context.params;
  try {
    await requireWorkspacePermission("boms.edit");
    const companyId = await requireApiCompanyId();
    const bom = await requireBom(supabase, id, companyId);

    const { error } = await supabase
      .from("vyron_cost_boms")
      .update({ image_bucket: null, image_path: null, image_mime: null })
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);

    if (bom.image_path) {
      await supabase.storage.from(bom.image_bucket || VYRON_DOCUMENTS_BUCKET).remove([bom.image_path]);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "BOM_NOT_FOUND") return notFound();
    return workspaceAccessErrorResponse(error, "Remove image failed.");
  }
}
