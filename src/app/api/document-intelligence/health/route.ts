import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const hasKey =
    Boolean(process.env.OPENAI_API_KEY) &&
    !String(process.env.OPENAI_API_KEY).includes("PASTE_YOUR");

  return NextResponse.json({
    ok: true,
    openaiKeyConfigured: hasKey,
    model: process.env.OPENAI_DOCUMENT_MODEL || "gpt-4o",
    fallbackModel: process.env.OPENAI_DOCUMENT_FALLBACK_MODEL || "gpt-4.1",
  });
}
