import { NextRequest, NextResponse } from "next/server";
import { requireActiveWorkspaceId, requireAdminSession } from "@/lib/vyron-workspace-admin-server";
import { BrandingService } from "@/lib/platform/branding";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/svg+xml": "image/svg+xml",
};

function adminErrorStatus(error: unknown, fallback = 400) {
  const message = error instanceof Error ? String(error.message || "") : "";
  if (message.includes("Workspace session required") || message.includes("Access denied") || message.includes("Admin access required")) {
    return 403;
  }
  if (message.includes("No active client workspace")) return 400;
  return fallback;
}

/** Rasterizes an SVG to PNG bytes via `sharp` when available; returns null if sharp can't be loaded. */
async function rasterizeSvgToPng(bytes: Buffer): Promise<Buffer | null> {
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    return await sharp(bytes, { density: 300 }).png().toBuffer();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession("admin.company");
    const workspaceId = await requireActiveWorkspaceId();

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file uploaded. Use form field name 'file'." }, { status: 400 });
    }

    const mime = ALLOWED_MIME[file.type];
    if (!mime) {
      return NextResponse.json({ ok: false, error: "Only PNG, JPG and SVG logo files are supported." }, { status: 400 });
    }

    let bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "Logo file exceeds the 2MB upload limit." }, { status: 400 });
    }

    let effectiveMime = mime;
    let svgRasterized = false;
    if (mime === "image/svg+xml") {
      // The Document Engine (jsPDF) cannot embed SVG directly — rasterize at upload time so the
      // stored logo always renders in generated PDFs. The original SVG is still used for on-screen
      // preview if rasterization isn't available in this environment.
      const rasterized = await rasterizeSvgToPng(bytes);
      if (rasterized) {
        bytes = Buffer.from(rasterized);
        effectiveMime = "image/png";
        svgRasterized = true;
      }
    }

    const dataUrl = `data:${effectiveMime};base64,${bytes.toString("base64")}`;
    const branding = await BrandingService.updateBrandingByWorkspaceId(workspaceId, { logoUrl: dataUrl });

    return NextResponse.json({
      ok: true,
      branding,
      svgRasterized: mime === "image/svg+xml" ? svgRasterized : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Logo upload failed." },
      { status: adminErrorStatus(error, 500) }
    );
  }
}
