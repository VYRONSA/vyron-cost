import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseExtractionQualityRecord,
  summariseExtractionQuality,
  type ExtractionQualityKpis,
  type ExtractionQualityRecord,
} from "@/lib/vyron-extraction-quality";

/**
 * VYRON — Extraction quality reporting.
 *
 * Reads the extraction audit records written by
 * `persistExtractionToDocument` and aggregates them into operational KPIs.
 *
 * WHY THE AUDIT LOG RATHER THAN A COLUMN
 * --------------------------------------
 * `vyron_document_extraction_logs.metadata` is already `jsonb`, so the metrics
 * needed no schema change — no migration to apply, and no window in which
 * deployed code expects a column the database does not have yet. Denormalising
 * into `vyron_documents` is a later optimisation if volume demands it; it is
 * not needed to make the numbers correct.
 */

/**
 * How many recent documents to consider.
 *
 * Bounded on purpose: this feeds a dashboard tile, and an unbounded scan of a
 * tenant's entire document history would grow without limit. The window is
 * reported alongside the KPIs so the number is never read as all-time.
 */
export const EXTRACTION_KPI_DOCUMENT_WINDOW = 500;

export type ExtractionQualityReport = ExtractionQualityKpis & {
  /** Documents examined, including any with no quality record. */
  documentsInWindow: number;
  windowSize: number;
};

const EMPTY_REPORT: ExtractionQualityReport = {
  documentsAssessed: 0,
  documentsInWindow: 0,
  windowSize: EXTRACTION_KPI_DOCUMENT_WINDOW,
  firstPassSuccessRate: null,
  retryRate: null,
  averageQuality: null,
  averageCompleteness: null,
  manualReviewRate: null,
  incompleteRate: null,
};

/**
 * Load extraction quality KPIs for one company.
 *
 * Deliberately two queries rather than one embedded join. The embedded-resource
 * filter syntax depends on PostgREST resolving the foreign key by name, which
 * cannot be verified without a live database; two plain queries are correct by
 * inspection.
 *
 * Never throws. A reporting tile must not be able to take down the dashboard.
 */
export async function getExtractionQualityReport(
  supabase: SupabaseClient | null,
  companyId: string | null | undefined
): Promise<ExtractionQualityReport> {
  if (!supabase || !companyId) return EMPTY_REPORT;

  try {
    const { data: documents, error: documentError } = await supabase
      .from("vyron_documents")
      .select("id")
      .eq("tenant_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(EXTRACTION_KPI_DOCUMENT_WINDOW);

    if (documentError || !documents?.length) return EMPTY_REPORT;

    const documentIds = documents.map((row) => String(row.id));

    const { data: logs, error: logError } = await supabase
      .from("vyron_document_extraction_logs")
      .select("document_id, metadata, created_at")
      .in("document_id", documentIds)
      .eq("stage", "extraction")
      .eq("status", "success")
      .order("created_at", { ascending: false });

    if (logError) return { ...EMPTY_REPORT, documentsInWindow: documentIds.length };

    /*
     * Newest successful extraction per document.
     *
     * A re-extraction writes a new row without removing the old one, so
     * counting every row would weight a repeatedly re-extracted document more
     * heavily than one processed once — and would mix a document's superseded
     * result into the current picture. Rows arrive newest-first, so the first
     * occurrence of each document id is the one that counts.
     */
    const newestByDocument = new Map<string, ExtractionQualityRecord>();
    for (const row of logs || []) {
      const documentId = String(row.document_id);
      if (newestByDocument.has(documentId)) continue;
      const metadata = row.metadata as Record<string, unknown> | null;
      const record = parseExtractionQualityRecord(metadata?.extractionQuality);
      if (record) newestByDocument.set(documentId, record);
    }

    return {
      ...summariseExtractionQuality([...newestByDocument.values()]),
      documentsInWindow: documentIds.length,
      windowSize: EXTRACTION_KPI_DOCUMENT_WINDOW,
    };
  } catch {
    return EMPTY_REPORT;
  }
}
