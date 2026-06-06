import { NextRequest, NextResponse } from "next/server";
import { isAllowedDocumentMime } from "@/lib/vyron-documents";
import { runDocumentExtraction } from "@/lib/vyron-document-extraction";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Direct file upload extraction (no storage). Prefer POST /api/documents/{id}/extract after upload. */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });
    }

    const mime = file.type || "application/octet-stream";
    if (!isAllowedDocumentMime(mime)) {
      return NextResponse.json(
        { ok: false, error: "Only PDF, PNG, JPG, JPEG and WEBP documents are supported." },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    console.log("[document-intelligence/extract] direct upload", {
      fileName: file.name,
      mime,
      byteSize: bytes.length,
    });

    const { extraction, modelUsed, log } = await runDocumentExtraction({
      fileName: file.name,
      mime,
      bytes,
    });

    return NextResponse.json({ ok: true, modelUsed, extraction, log });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown extraction error.",
      },
      { status: 500 }
    );
  }
}
