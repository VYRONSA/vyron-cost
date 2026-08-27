import { NextRequest, NextResponse } from "next/server";
import { requireAdminWorkspaceId } from "@/lib/vyron-workspace-admin-server";
import { BrandingService } from "@/lib/platform/branding";
import type { BrandingUpdateInput } from "@/lib/platform/branding";
import { mergeBrandingDraft } from "@/lib/platform/branding/mergeBrandingDraft";
import { toDocumentPdfBranding } from "@/lib/platform/documents/resolveDocumentBranding";
import { renderDocumentPdf } from "@/lib/platform/documents/vyron-document-pdf-engine";
import { buildPreviewDocumentModel, type PreviewDocumentType } from "@/lib/platform/documents/buildPreviewDocumentModel";

export const runtime = "nodejs";

const VALID_TYPES: PreviewDocumentType[] = ["purchase_order", "goods_receipt", "customer_invoice", "sales_order", "quotation"];

/** No session is 401; a session without the permission is 403. */
function adminErrorStatus(error: unknown, fallback = 400) {
  const message = error instanceof Error ? String(error.message || "") : "";
  if (message.includes("Workspace session required")) return 401;
  if (message.includes("Access denied") || message.includes("Admin access required")) return 403;
  if (message.includes("No active client workspace")) return 400;
  return fallback;
}

export async function POST(request: NextRequest) {
  try {
    // The preview renders the saved branding of this workspace. Resolved from the
    // session so a forged cookie cannot render another company's letterhead.
    const { workspaceId } = await requireAdminWorkspaceId("admin.company");

    const body = (await request.json().catch(() => ({}))) as {
      documentType?: string;
      branding?: BrandingUpdateInput;
    };

    const documentType = VALID_TYPES.includes(body.documentType as PreviewDocumentType)
      ? (body.documentType as PreviewDocumentType)
      : "purchase_order";

    const savedBranding = await BrandingService.getBrandingByWorkspaceId(workspaceId);
    const draftBranding = mergeBrandingDraft(savedBranding, body.branding || {});
    const pdfBranding = toDocumentPdfBranding(draftBranding);

    const model = buildPreviewDocumentModel(documentType, pdfBranding);
    const bytes = renderDocumentPdf(model);

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=\"branding-preview.pdf\"",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Preview generation failed." },
      { status: adminErrorStatus(error, 500) }
    );
  }
}
