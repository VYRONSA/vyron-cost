/**
 * Developer-only extraction diagnostics.
 *
 * Serves the evidence retained by `captureExtractionEvidence` for one document:
 * how the engine classified it, the crop the model was actually shown, the
 * printed column headings it read, how it mapped them, the arithmetic report,
 * the retry history and the untruncated model responses.
 *
 * Deliberately NOT part of the operator review workflow. Operators act on the
 * reviewed extraction; this exists so an engineer can explain a bad one without
 * a billable re-run. Platform session required, read-only, no mutation.
 */

import { NextRequest, NextResponse } from "next/server";
import { developerApiUnauthorized, requirePlatformSessionFromRequest } from "@/lib/vyron-platform-auth";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed-URL lifetime for a retained crop. Long enough to inspect, not to share. */
const CROP_URL_TTL_SECONDS = 600;

export async function GET(request: NextRequest) {
  try {
    await requirePlatformSessionFromRequest(request, ["PLATFORM_ADMIN", "PLATFORM_OPERATOR", "PLATFORM_AUDITOR"]);
  } catch (error) {
    return developerApiUnauthorized(error instanceof Error ? error.message : "Developer authentication required.");
  }

  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin client unavailable." }, { status: 500 });
  }

  const documentId = request.nextUrl.searchParams.get("documentId");

  /*
   * Without a document id this answers the other question a developer has:
   * which recent extractions retained evidence at all. That is the entry point
   * — nobody knows the failing document's uuid by heart.
   */
  if (!documentId) {
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 25)));
    const { data, error } = await supabase
      .from("vyron_document_extraction_logs")
      .select("document_id, status, message, model, metadata, created_at")
      .in("status", ["evidence", "monitoring"])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const runs = (data || []).map((row) => {
      const metadata = (row.metadata || {}) as Record<string, unknown>;
      const monitoring = (metadata.extractionMonitoring || {}) as Record<string, unknown>;
      const evidence = (metadata.extractionEvidence || {}) as Record<string, unknown>;
      return {
        documentId: row.document_id,
        capturedAt: row.created_at,
        model: row.model,
        hasEvidence: row.status === "evidence",
        triggers: (evidence.triggers as string[]) || [],
        visionClass: monitoring.visionClass ?? null,
        attemptCount: monitoring.attemptCount ?? null,
        retryCount: monitoring.retryCount ?? null,
        tableVisionUsed: monitoring.tableVisionUsed ?? null,
        arithmeticStatus: monitoring.arithmeticStatus ?? null,
        completenessStatus: monitoring.completenessStatus ?? null,
        extractedLineItemCount: monitoring.extractedLineItemCount ?? null,
        extractionDurationMs: monitoring.extractionDurationMs ?? null,
        totalTokens: monitoring.totalTokens ?? null,
        succeeded: monitoring.succeeded ?? null,
      };
    });

    // The dashboard figures, computed over the window actually returned rather
    // than implied — a rate quoted without its denominator is not a measurement.
    const withMetrics = runs.filter((run) => run.completenessStatus !== null);
    const summary = {
      windowSize: runs.length,
      measuredRuns: withMetrics.length,
      succeeded: withMetrics.filter((run) => run.succeeded === true).length,
      retried: withMetrics.filter((run) => Number(run.retryCount || 0) > 0).length,
      arithmeticFailures: withMetrics.filter((run) => run.arithmeticStatus === "Fail").length,
      tableVisionUsed: withMetrics.filter((run) => run.tableVisionUsed === true).length,
      averageDurationMs: withMetrics.length
        ? Math.round(withMetrics.reduce((sum, run) => sum + Number(run.extractionDurationMs || 0), 0) / withMetrics.length)
        : null,
      averageTotalTokens: withMetrics.length
        ? Math.round(withMetrics.reduce((sum, run) => sum + Number(run.totalTokens || 0), 0) / withMetrics.length)
        : null,
      byVisionClass: withMetrics.reduce<Record<string, number>>((acc, run) => {
        const key = String(run.visionClass ?? "unknown");
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    };

    return NextResponse.json({ ok: true, summary, runs });
  }

  const { data, error } = await supabase
    .from("vyron_document_extraction_logs")
    .select("document_id, status, message, model, metadata, created_at")
    .eq("document_id", documentId)
    .in("status", ["evidence", "monitoring"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json(
      {
        ok: true,
        documentId,
        found: false,
        message:
          "No diagnostics retained for this document. Evidence is kept only for runs that retried or failed a validator; a clean extraction records metrics alone.",
      },
      { status: 200 }
    );
  }

  const row = data[0];
  const metadata = (row.metadata || {}) as Record<string, unknown>;
  const evidence = (metadata.extractionEvidence || {}) as Record<string, unknown>;

  // Crops live in a private bucket; hand back short-lived signed URLs rather
  // than the raw paths, which would not be openable.
  const cropPaths = (evidence.cropPaths as string[]) || [];
  const crops: Array<{ path: string; url: string | null }> = [];
  for (const path of cropPaths) {
    const { data: signed } = await supabase.storage
      .from(VYRON_DOCUMENTS_BUCKET)
      .createSignedUrl(path, CROP_URL_TTL_SECONDS);
    crops.push({ path, url: signed?.signedUrl || null });
  }

  return NextResponse.json({
    ok: true,
    documentId,
    found: true,
    capturedAt: row.created_at,
    model: row.model,
    monitoring: metadata.extractionMonitoring ?? null,
    triggers: evidence.triggers ?? [],
    visionClass: evidence.visionClass ?? null,
    visionReason: evidence.visionReason ?? null,
    tableVisionOutcome: evidence.tableVisionOutcome ?? null,
    tableVision: evidence.tableVision ?? [],
    tableVisionResponses: evidence.tableVisionResponses ?? [],
    arithmeticReport: evidence.arithmeticReport ?? null,
    completeness: evidence.completeness ?? null,
    retryHistory: evidence.retryHistory ?? [],
    rawResponses: evidence.rawResponses ?? [],
    normalizedExtraction: evidence.normalizedExtraction ?? null,
    warnings: evidence.warnings ?? [],
    crops,
  });
}
