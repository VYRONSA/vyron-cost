import type { CanonicalOrderExtraction } from "@/lib/order-engine/extraction";
import type { ExtractionConfidence } from "@/lib/order-engine/types";

/**
 * The document-extraction provider interface.
 *
 * A provider turns a document (today: PDF) into the canonical order extraction
 * (extraction.ts). VOLORA holds the boundary, not the provider: registering one
 * later is configuration, not a redesign.
 *
 * NO PROVIDER IS REGISTERED IN THIS BUILD. Until a tenant configures one, a
 * PDF is kept as "received, extraction not configured": the document is stored
 * with its hash, the order is not invented, and the Exception Centre says so.
 *
 * A provider must:
 *  - return values exactly as written, with per-field confidence;
 *  - state page references where it has them;
 *  - never fill a field it did not read (no defaults, no guesses).
 */

export type ExtractionDocument = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string | null;
  /** Where the bytes are stored (vyron-documents bucket), when a provider stored them. */
  storagePath?: string | null;
  /** The bytes, when the caller holds them in memory. */
  bytes?: Buffer | null;
};

export type ExtractionAttempt =
  | { status: "SUCCEEDED"; provider: string; extraction: CanonicalOrderExtraction; raw: Record<string, unknown>; pageCount: number | null; confidence: ExtractionConfidence; at: string }
  | { status: "FAILED"; provider: string; error: string; raw: Record<string, unknown>; at: string }
  | { status: "NOT_CONFIGURED"; provider: null; reason: string; at: string };

export type PdfExtractor = {
  /** Stable id stored in ordering settings (`pdf_extractor`). */
  id: string;
  label: string;
  /** True only when the provider can actually be called in this deployment. */
  available(): boolean;
  extract(document: ExtractionDocument, context: { companyId: string }): Promise<ExtractionAttempt>;
};

const REGISTRY = new Map<string, PdfExtractor>();

/** Register a provider. Deployments add theirs at start-up; none ships here. */
export function registerPdfExtractor(extractor: PdfExtractor): void {
  REGISTRY.set(extractor.id, extractor);
}

export function listPdfExtractors(): string[] {
  return [...REGISTRY.values()].filter((e) => e.available()).map((e) => e.id);
}

export function getPdfExtractor(id: string | null | undefined): PdfExtractor | null {
  const key = String(id || "").trim();
  if (!key) return null;
  const extractor = REGISTRY.get(key);
  return extractor && extractor.available() ? extractor : null;
}

/**
 * Run the company's configured extractor over a document. With none
 * configured — the state in this build — the attempt is recorded as
 * NOT_CONFIGURED and nothing about the order is invented.
 */
export async function extractDocument(
  document: ExtractionDocument,
  context: { companyId: string; extractorId: string | null }
): Promise<ExtractionAttempt> {
  const at = new Date().toISOString();
  const extractor = getPdfExtractor(context.extractorId);
  if (!extractor) {
    return {
      status: "NOT_CONFIGURED",
      provider: null,
      reason: context.extractorId
        ? `The configured document extractor "${context.extractorId}" is not available in this deployment.`
        : "No document extractor is configured for this company.",
      at,
    };
  }
  try {
    return await extractor.extract(document, { companyId: context.companyId });
  } catch (error) {
    return { status: "FAILED", provider: extractor.id, error: error instanceof Error ? error.message : "The extractor failed.", raw: {}, at };
  }
}

/** For tests: remove every registered provider. */
export function __clearPdfExtractors(): void {
  REGISTRY.clear();
}
