/**
 * Deciding whether an uploaded file is one invoice or several.
 *
 * A supplier sends a month of invoices as one scan. The extractor reads the
 * whole file, takes the header from the first page and returns every line it
 * finds, and the importer stored that as a single invoice — so invoice
 * IO151093, which has one line worth R1,539.80, arrived carrying twenty-three
 * lines worth R152,817.51 belonging to five different invoices. Three of those
 * five were already imported separately; approving it would have duplicated
 * R121,823 of purchase cost.
 *
 * The safe answer is to refuse. Splitting a batch scan reliably means being
 * right about where every invoice starts and ends, across layouts this code has
 * never seen, and being wrong writes money into the wrong account. Refusing
 * costs the operator one manual split and cannot corrupt the ledger.
 *
 * What must never happen again is the silent case: first header, all lines, one
 * invoice.
 */

export type BoundaryLine = {
  /** Which page of the uploaded file this line was read from, 1-based. */
  sourcePage?: number | null;
  /** The invoice number printed on the page this line came from, if read. */
  sourceInvoiceNumber?: string | null;
};

export type BoundaryInput = {
  /** The invoice number on the document as a whole — normally page one's. */
  invoiceNumber?: string | null;
  lineItems: BoundaryLine[];
  /** Invoice numbers the extractor saw anywhere in the file. */
  invoiceNumbersSeen?: (string | null | undefined)[];
};

export type BoundaryResult =
  | { kind: "single"; invoiceNumber: string | null; pages: number[] }
  | {
      kind: "multiple";
      invoiceNumbers: string[];
      /** Which invoice each page appears to belong to, where known. */
      pages: { page: number; invoiceNumber: string | null }[];
      message: string;
    };

const clean = (value: unknown): string =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** Invoice numbers found anywhere in the extraction, de-duplicated. */
export function collectInvoiceNumbers(input: BoundaryInput): string[] {
  const seen = new Map<string, string>();
  const add = (value: unknown) => {
    const key = clean(value);
    if (!key) return;
    if (!seen.has(key)) seen.set(key, String(value).trim());
  };

  add(input.invoiceNumber);
  for (const n of input.invoiceNumbersSeen || []) add(n);
  for (const line of input.lineItems || []) add(line.sourceInvoiceNumber);

  return [...seen.values()];
}

/**
 * Is this one invoice or several?
 *
 * More than one distinct invoice number anywhere in the file means several,
 * whether the numbers came from the header, the per-line provenance, or the
 * extractor's own list. One number, or none readable, is treated as a single
 * invoice — the ordinary case, and the one this leaves untouched.
 */
export function detectInvoiceBoundaries(input: BoundaryInput): BoundaryResult {
  const numbers = collectInvoiceNumbers(input);

  const pageMap = new Map<number, string | null>();
  for (const line of input.lineItems || []) {
    const page = Number(line.sourcePage);
    if (!Number.isFinite(page) || page < 1) continue;
    if (!pageMap.has(page)) pageMap.set(page, line.sourceInvoiceNumber?.trim() || null);
  }
  const pages = [...pageMap.keys()].sort((a, b) => a - b);

  if (numbers.length <= 1) {
    return { kind: "single", invoiceNumber: numbers[0] ?? null, pages };
  }

  return {
    kind: "multiple",
    invoiceNumbers: numbers,
    pages: pages.map((page) => ({ page, invoiceNumber: pageMap.get(page) ?? null })),
    message:
      `This file contains ${numbers.length} separate invoices (${numbers.join(", ")}). ` +
      "Split it into one file per invoice and upload them individually — importing it as a single " +
      "invoice would attach the other invoices' lines to the first one.",
  };
}

export class MultipleInvoicesInDocumentError extends Error {
  readonly invoiceNumbers: string[];
  readonly pages: { page: number; invoiceNumber: string | null }[];

  constructor(result: Extract<BoundaryResult, { kind: "multiple" }>) {
    super(result.message);
    this.name = "MultipleInvoicesInDocumentError";
    this.invoiceNumbers = result.invoiceNumbers;
    this.pages = result.pages;
  }
}

/**
 * Refuse a batch scan before any of it is written.
 *
 * Called after extraction and before persistence, so a file containing several
 * invoices leaves no partial invoice behind.
 */
export function assertSingleInvoiceDocument(input: BoundaryInput): BoundaryResult {
  const result = detectInvoiceBoundaries(input);
  if (result.kind === "multiple") throw new MultipleInvoicesInDocumentError(result);
  return result;
}
