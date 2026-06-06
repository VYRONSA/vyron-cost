import { NextRequest, NextResponse } from "next/server";
import { saveProcurementTracking } from "@/lib/vyron-procurement-ai-data";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    await saveProcurementTracking(
      decodeURIComponent(key),
      {
        status: body.status,
        ownerName: body.ownerName,
        ownerEmail: body.ownerEmail,
        notes: body.notes,
        dueDate: body.dueDate,
        scheduledReviewDate: body.scheduledReviewDate,
        expectedBenefit: body.expectedBenefit != null ? Number(body.expectedBenefit) : undefined,
        actualBenefit: body.actualBenefit != null ? Number(body.actualBenefit) : undefined,
        implementationDate: body.implementationDate,
        evidence: body.evidence,
      },
      body.changedBy || "user"
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Save failed." },
      { status: 500 }
    );
  }
}
