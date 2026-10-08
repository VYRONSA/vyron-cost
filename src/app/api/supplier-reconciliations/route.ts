import { NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { memberDisplayName, sessionAuditActor } from "@/lib/vyron-audit-actor";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import {
  ReconciliationError,
  listSupplierReconciliations,
  loadStatementContext,
  previewInterpretedStatementMatch,
  runApprovedInterpretedStatementReconciliation,
  runApprovedStatementReconciliation,
  runSupplierReconciliation,
} from "@/lib/vyron-supplier-reconciliation";
import { StatementPdfError, extractSupplierStatementPdf, isPdfUpload } from "@/lib/vyron-supplier-statement-pdf";
import { interpretStatementWithAi, statementAiEnabled } from "@/lib/vyron-supplier-statement-ai";
import { signReviewedInterpretation } from "@/lib/vyron-supplier-statement-match";
import { UploadTableError, readUploadedTable } from "@/lib/vyron-upload-table";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 120 s: a long statement's AI interpretation runs in parallel batches (only when SUPPLIER_STATEMENT_AI=on).
export const maxDuration = 120;

/** GET — this company's reconciliation runs, newest first. */
export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("suppliers.view");
    const companyId = await requireApiCompanyId();
    return NextResponse.json({ ok: true, reconciliations: await listSupplierReconciliations(supabase, companyId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load reconciliations failed.");
  }
}

/**
 * POST multipart — reconcile a supplier statement / invoice list. Posts nothing to the books.
 *   CSV / XLSX { file, supplierName? } — reconciled directly (unchanged).
 *   PDF { file, action: "extract" } — read the statement and return it for review. Writes nothing.
 *   PDF { file, action: "approve", digest, supplierName, approved: "true" } — reconcile the reviewed
 *       statement; the PDF must give exactly the extraction that was reviewed.
 *   With SUPPLIER_STATEMENT_AI=on, "extract" also returns the AI interpretation and a signed review
 *   token; { action: "match", reviewBody, reviewSignature, supplierName } previews the deterministic
 *   matches (writes nothing); "approve" with the token reconciles on the reviewed interpretation.
 */
export async function POST(request: Request) {
  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    const session = await requireWorkspacePermission("suppliers.edit");
    const companyId = await requireApiCompanyId();
    const form = await request.formData();
    if (String(form.get("action") || "") === "match") {
      const match = await previewInterpretedStatementMatch(supabase, companyId, {
        reviewBody: String(form.get("reviewBody") || ""),
        reviewSignature: String(form.get("reviewSignature") || ""),
        supplierName: String(form.get("supplierName") || ""),
      });
      return NextResponse.json({ ok: true, match }, { headers: { "Cache-Control": "no-store" } });
    }
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a supplier statement or invoice list to upload." }, { status: 400 });
    if (isPdfUpload(file)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const context = await loadStatementContext(supabase, companyId);
      const action = String(form.get("action") || "extract");
      if (action === "extract") {
        const extraction = await extractSupplierStatementPdf(bytes, { ownCompanyNames: context.ownCompanyNames });
        // With SUPPLIER_STATEMENT_AI=on the AI interpretation is returned for review, signed so approval
        // can use exactly what was reviewed (the AI is not asked again).
        const interpretation = statementAiEnabled()
          ? await interpretStatementWithAi(extraction, { companyId, userId: session.userId, workspaceId: session.workspaceId ?? null, ownCompanyNames: context.ownCompanyNames })
          : undefined;
        const reviewToken = interpretation ? signReviewedInterpretation({ companyId, extractionDigest: extraction.digest, fileSha256: extraction.fileSha256, interpretation }) : null;
        return NextResponse.json(
          { ok: true, mode: "review", fileName: file.name, extraction, knownSuppliers: context.supplierNames, ...(interpretation ? { interpretation, reviewToken } : {}) },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
      if (action !== "approve") return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
      if (String(form.get("approved") || "") !== "true") return NextResponse.json({ ok: false, error: "Review and approve the extracted statement first." }, { status: 400 });
      const reviewBody = String(form.get("reviewBody") || "");
      if (reviewBody) {
        const interpreted = await runApprovedInterpretedStatementReconciliation(
          supabase,
          companyId,
          {
            bytes,
            fileName: file.name,
            approvedDigest: String(form.get("digest") || ""),
            supplierName: String(form.get("supplierName") || ""),
            ownCompanyNames: context.ownCompanyNames,
            approvedBy: await memberDisplayName(supabase, session),
            reviewBody,
            reviewSignature: String(form.get("reviewSignature") || ""),
          },
          sessionAuditActor(session)
        );
        return NextResponse.json({ ok: true, ...interpreted });
      }
      const result = await runApprovedStatementReconciliation(
        supabase,
        companyId,
        {
          bytes,
          fileName: file.name,
          approvedDigest: String(form.get("digest") || ""),
          supplierName: String(form.get("supplierName") || ""),
          ownCompanyNames: context.ownCompanyNames,
          approvedBy: await memberDisplayName(supabase, session),
        },
        sessionAuditActor(session)
      );
      return NextResponse.json({ ok: true, ...result });
    }
    const table = await readUploadedTable(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
    const supplierName = String(form.get("supplierName") || "").trim() || null;
    const result = await runSupplierReconciliation(supabase, companyId, { table, sha256: table.sha256, fileName: file.name, supplierName }, sessionAuditActor(session));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof UploadTableError || error instanceof ReconciliationError || error instanceof StatementPdfError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return workspaceAccessErrorResponse(error, "Reconciliation failed.");
  }
}
