import { NextRequest, NextResponse } from "next/server";
import { developerApiUnauthorized, requirePlatformSessionFromRequest } from "@/lib/vyron-platform-auth";
import { runSupplierInvoiceBatchCertificationV2 } from "@/lib/document-intelligence-v2/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requirePlatformSessionFromRequest(request, ["PLATFORM_ADMIN", "PLATFORM_OPERATOR", "PLATFORM_AUDITOR"]);
  } catch (error) {
    return developerApiUnauthorized(error instanceof Error ? error.message : "Developer authentication required.");
  }

  try {
    const form = await request.formData();
    const fileValues = form.getAll("files");
    const modelValue = form.get("model");
    const declarationValue = form.get("realInvoicesDeclaration");
    const expectedCountsRaw = form.get("expectedLineItemCounts");

    if (declarationValue !== "I_CONFIRM_REAL_SUPPLIER_INVOICES") {
      return NextResponse.json(
        {
          ok: false,
          error: "Certification requires confirmation that all uploaded files are real supplier invoices.",
        },
        { status: 400 }
      );
    }

    const files = fileValues.filter((value): value is File => value instanceof File);
    if (!files.length) {
      return NextResponse.json({ ok: false, error: "At least one PDF file is required." }, { status: 400 });
    }

    let expectedMap: Record<string, number> = {};
    if (typeof expectedCountsRaw === "string" && expectedCountsRaw.trim()) {
      try {
        const parsed = JSON.parse(expectedCountsRaw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          expectedMap = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, Number(value || 0)])
          );
        }
      } catch {
        return NextResponse.json(
          {
            ok: false,
            error: "expectedLineItemCounts must be valid JSON object: { \"invoice.pdf\": 12 }",
          },
          { status: 400 }
        );
      }
    }

    const invoices = await Promise.all(
      files.map(async (file) => ({
        fileName: file.name,
        mime: file.type || "application/pdf",
        bytes: Buffer.from(await file.arrayBuffer()),
        expectedLineItemCount: Number(expectedMap[file.name] || 0),
      }))
    );

    const batch = await runSupplierInvoiceBatchCertificationV2({
      invoices,
      model: typeof modelValue === "string" && modelValue.trim() ? modelValue.trim() : undefined,
    });

    if (!batch.ok) {
      return NextResponse.json(batch, { status: 200 });
    }

    return NextResponse.json(batch, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "V2 certification failed.",
      },
      { status: 500 }
    );
  }
}
