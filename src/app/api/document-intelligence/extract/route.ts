import { NextRequest, NextResponse } from "next/server";
import { isAllowedDocumentMime } from "@/lib/vyron-documents";
import { runDocumentExtraction } from "@/lib/vyron-document-extraction";
import { requireDocumentTenantId } from "@/lib/vyron-document-tenant-access";
import { getServerActiveWorkspace, getWorkspaceCompanyResolution } from "@/lib/vyron-workspace-server";
import { getServerWorkspaceSession } from "@/lib/vyron-workspace-admin-server";
import { resolveSubscription } from "@/platform/managers/subscription-manager";
import { AiUsageService, resolveProviderForModel } from "@/lib/platform/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

// This route has no session/workspace requirement today (unlike
// /api/documents/{id}/extract, which fails closed via requireDocumentTenantId).
// AI usage enforcement/recording here is best-effort: if company context can't
// be resolved, the request proceeds exactly as before rather than newly
// requiring auth on a route that has never required it.
async function resolveBestEffortAiContext() {
  try {
    const [workspace, companyResolution, tenantId, subscription] = await Promise.all([
      getServerActiveWorkspace(),
      getWorkspaceCompanyResolution(),
      requireDocumentTenantId(),
      resolveSubscription(),
    ]);
    const session = await getServerWorkspaceSession();
    return {
      companyId: tenantId,
      workspaceId: companyResolution.workspaceId || workspace?.id || null,
      userId: session?.userId || null,
      packageName: subscription.packageName,
    };
  } catch {
    return null;
  }
}

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

    const aiContext = await resolveBestEffortAiContext();

    if (aiContext) {
      const allowanceCheck = await AiUsageService.checkAllowance({ companyId: aiContext.companyId, packageName: aiContext.packageName });
      if (!allowanceCheck.allowed) {
        return NextResponse.json(
          {
            ok: false,
            error: "AI_ALLOWANCE_EXCEEDED",
            message: "You have reached your monthly AI allowance. Upgrade your subscription to continue using AI features.",
            check: allowanceCheck,
          },
          { status: 402 }
        );
      }
    }

    let result: Awaited<ReturnType<typeof runDocumentExtraction>>;
    try {
      result = await runDocumentExtraction({
        fileName: file.name,
        mime,
        bytes,
      });
    } catch (extractionError) {
      if (aiContext) {
        await AiUsageService.recordUsage({
          companyId: aiContext.companyId,
          workspaceId: aiContext.workspaceId,
          userId: aiContext.userId,
          packageName: aiContext.packageName,
          productId: "vyron_cost",
          featureId: "document_intelligence",
          provider: "openai",
          model: "unknown",
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          executionTimeMs: 0,
          success: false,
          errorMessage: extractionError instanceof Error ? extractionError.message : "Extraction failed.",
        });
      }
      throw extractionError;
    }

    const { extraction, modelUsed, log } = result;

    if (aiContext) {
      await AiUsageService.recordUsage({
        companyId: aiContext.companyId,
        workspaceId: aiContext.workspaceId,
        userId: aiContext.userId,
        packageName: aiContext.packageName,
        productId: "vyron_cost",
        featureId: "document_intelligence",
        provider: resolveProviderForModel(modelUsed),
        model: modelUsed,
        promptTokens: result.usage?.promptTokens || 0,
        completionTokens: result.usage?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
        executionTimeMs: result.executionTimeMs,
        success: true,
      });
    }

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
