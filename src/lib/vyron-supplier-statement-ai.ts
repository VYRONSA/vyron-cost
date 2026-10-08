import { AiUsageService, computeCostUsd, resolveProviderForModel } from "@/lib/platform/ai";
import { AiServiceUnavailableError, classifyAiProviderFailure } from "@/lib/vyron-ai-service-errors";
import { findAmounts, findDates, type PdfCell, type StatementExtraction, type StatementTransaction } from "@/lib/vyron-supplier-statement-pdf";
import { normalisedNameKey } from "@/lib/vyron-supplier-resolution";

/**
 * VOLORA — supplier statement: semantic interpretation (Phase 1).
 *
 * PDF.js (vyron-supplier-statement-pdf.ts) stays authoritative for every date, amount, balance and
 * row position. This module only asks a statement-specific AI call what the statement MEANS — which
 * column holds the document number and which hold other references, what each row is (invoice,
 * payment, unallocated receipt …), which invoice a payment settles, and the statement's identity
 * fields — and then checks every answer against the text it was given:
 *
 *   - money amounts are replaced by "{amount}" before anything is sent, and the AI schema has no
 *     field for a date, amount or balance; those always come from the reader;
 *   - every identifier the AI returns must appear verbatim in the row (or statement text) it cites,
 *     otherwise it is rejected and the row is marked Needs Review;
 *   - a type that contradicts the row's debit/credit direction is marked Needs Review;
 *   - if the AI is disabled, over budget, unavailable, slow or returns anything invalid, the reader's
 *     own deterministic reading is used and every affected row is marked Needs Review.
 *
 * It never approves, reconciles, posts or writes accounting records. Separate from — and sharing no
 * code with — the frozen Supplier Invoice extraction engine; it reuses only the platform AI budget /
 * usage services and the provider-failure classification.
 */

export const STATEMENT_LINE_TYPES = ["invoice", "credit_note", "debit_note", "payment", "unallocated_receipt", "journal", "adjustment", "interest", "discount", "balance_line", "unknown"] as const;
export type StatementLineType = (typeof STATEMENT_LINE_TYPES)[number];
export const STATEMENT_COLUMN_ROLES = ["documentNumber", "supplierReference", "customerOrderReference", "paymentReference", "date", "dueDate", "description", "type", "debit", "credit", "amount", "balance", "other"] as const;
export type StatementColumnRole = (typeof STATEMENT_COLUMN_ROLES)[number];
type Confidence = "high" | "medium" | "low";

export type AiStatus = "ok" | "partial" | "disabled" | "skipped" | "no_api_key" | "budget_exceeded" | "provider_unavailable" | "timeout" | "invalid_response";

export type InterpretedLine = {
  index: number;
  page: number;
  /** Deterministic, from the PDF reader — never from the AI. */
  date: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  direction: "debit" | "credit" | "none";
  type: StatementLineType;
  typeSource: "ai" | "reader";
  documentNumber: string | null;
  secondaryReferences: string[];
  paymentAllocatesDocumentNumber: string | null;
  /** "column": read from the statement's document-number column on this row; "ai": the AI's validated reading (no such column). */
  allocationSource: "column" | "ai" | null;
  /**
   * What the allocated number is, decided from this statement alone: an invoice row on this
   * statement; the reference of an unallocated receipt on this statement (not an invoice); or a
   * document not on this statement (e.g. an earlier invoice). Null when there is no allocation.
   */
  allocationKind: "invoice_on_statement" | "receipt" | "document" | null;
  /** Why a payment carries no allocation, or what its allocation is when it is not an invoice. */
  allocationNote: string | null;
  descriptionMeaning: string | null;
  evidence: string | null;
  confidence: Confidence;
  /** The document's own structure proves this invoice (debit, number under the document-number column, balance consistent, no contradiction). */
  structurallyConfirmed: boolean;
  /** How much the running balance moved on this row, in the statement's display order (deterministic; null when unknown). */
  balanceMovement: number | null;
  /** Only supplier documents (invoice, credit note, debit note) — or a debit row that may be one — need review. */
  needsReview: boolean;
  reviewReasons: string[];
  /** Observations on rows outside the reconciliation population (payments, receipts, …): audit only, never a review item. */
  auditNotes: string[];
  sourceText: string;
};

export type ValidatedField = { value: string | null; sourceText: string | null; rejected: string | null };

export type StatementInterpretation = {
  aiStatus: AiStatus;
  aiMessage: string | null;
  model: string | null;
  usage: { calls: number; inputTokens: number; outputTokens: number; costUsd: number } | null;
  metadata: {
    supplierName: ValidatedField;
    supplierEmail: ValidatedField;
    supplierWebsite: ValidatedField;
    supplierVatNumber: ValidatedField;
    supplierAccountNumber: ValidatedField;
    statementDate: ValidatedField;
    periodFrom: ValidatedField;
    periodTo: ValidatedField;
    currency: ValidatedField;
    ordering: "newest_first" | "oldest_first" | "unknown";
  };
  columns: Array<{ header: string; role: StatementColumnRole; x0: number; x1: number }>;
  lines: InterpretedLine[];
  rejected: Array<{ lineIndex: number | null; field: string; value: string; reason: string }>;
  counts: Record<StatementLineType, number> & { needsReview: number; invoicesWithoutDocumentNumber: number; aiLines: number; readerLines: number };
};

export type StatementAiDeps = {
  fetch: typeof fetch;
  apiKey: string | undefined;
  model: string;
  checkAllowance: (input: { companyId: string }) => Promise<{ allowed: boolean; status?: string }>;
  recordUsage: (input: Parameters<typeof AiUsageService.recordUsage>[0]) => Promise<unknown>;
  timeoutMs: number;
  batchSize: number;
  concurrency: number;
  retryDelayMs: number;
};

const DEFAULT_MODEL = "gpt-4o";
const MAX_OUTPUT_TOKENS = 12000;

function defaultDeps(): StatementAiDeps {
  return {
    fetch: (...args) => fetch(...args),
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_STATEMENT_MODEL || process.env.OPENAI_DOCUMENT_MODEL || DEFAULT_MODEL,
    checkAllowance: (input) => AiUsageService.checkAllowance(input),
    recordUsage: (input) => AiUsageService.recordUsage(input),
    timeoutMs: 55_000,
    batchSize: 50,
    concurrency: 5,
    retryDelayMs: 1500,
  };
}

/** True when the statement AI layer is switched on for this deployment (SUPPLIER_STATEMENT_AI=on). */
export function statementAiEnabled(): boolean {
  return String(process.env.SUPPLIER_STATEMENT_AI || "").trim().toLowerCase() === "on";
}

// ---------------------------------------------------------------------------------------------
// Schemas (OpenAI Responses API, strict structured output)
// ---------------------------------------------------------------------------------------------

const nullableString = { type: ["string", "null"] };
export const STATEMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["supplierName", "supplierEmail", "supplierWebsite", "supplierVatNumber", "supplierAccountNumber", "statementDate", "periodFrom", "periodTo", "currency", "ordering", "columns"],
  properties: {
    supplierName: nullableString,
    supplierEmail: nullableString,
    supplierWebsite: nullableString,
    supplierVatNumber: nullableString,
    supplierAccountNumber: nullableString,
    statementDate: nullableString,
    periodFrom: nullableString,
    periodTo: nullableString,
    currency: nullableString,
    ordering: { type: "string", enum: ["newest_first", "oldest_first", "unknown"] },
    columns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["header", "role"],
        properties: { header: { type: "string" }, role: { type: "string", enum: [...STATEMENT_COLUMN_ROLES] } },
      },
    },
  },
} as const;

export const LINES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["transactions"],
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lineIndex", "type", "documentNumberCell", "secondaryReferenceCells", "paymentAllocatesDocumentNumber", "descriptionMeaning", "evidence", "confidence"],
        properties: {
          lineIndex: { type: "integer" },
          type: { type: "string", enum: [...STATEMENT_LINE_TYPES] },
          documentNumberCell: nullableString,
          secondaryReferenceCells: { type: "array", items: { type: "string" } },
          paymentAllocatesDocumentNumber: nullableString,
          descriptionMeaning: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------------------------
// Prompts (statement-specific; independent of the invoice prompts)
// ---------------------------------------------------------------------------------------------

export const STATEMENT_INSTRUCTIONS = `You interpret a supplier's account statement for an accounting system. The text was already extracted from the PDF.
Money amounts have been replaced by the placeholder {amount}; you never see, return or calculate amounts, balances or totals.

Return:
- columns: one entry per column-heading cell given, "header" copied exactly, with its role:
  documentNumber = the supplier's own document identity on each row (headings such as Invoice, Inv No, Invoice Number, Document, Doc No, Document Number, Number, Tran No). At most ONE column is documentNumber.
  supplierReference = another reference of the supplier (Our Ref, Our Reference, Sales Order, Delivery Note, Reference when a document-number column also exists).
  customerOrderReference = the customer's own reference or order (Your Ref, Your Reference, Customer Ref, Order No, PO, Purchase Order).
  paymentReference = a column only for payment references. date / dueDate / description / type / debit / credit / amount / balance as named; other for anything else.
  When a statement has both "Invoice" and "Our Reference", Invoice is documentNumber and Our Reference is supplierReference — never the same role.
- supplierName, supplierEmail, supplierWebsite, supplierVatNumber, supplierAccountNumber: copy exactly as written in the statement text; null when not written.
  supplierAccountNumber is the CUSTOMER'S account number with the supplier (Account No, Customer No, Acc Ref next to the customer details) — never a bank account number from banking / payment details (Bank, Branch Code, SWIFT).
  The statement's recipient (the customer, named below) is never the supplier. Do not derive a supplier name from an email or web address.
- statementDate, periodFrom, periodTo: the date text copied exactly as written next to a statement-date / period label; null when absent. Never compute a date.
- currency: as written (e.g. ZAR, R) or null.
- ordering: newest_first when the rows run from the latest date down to the earliest, oldest_first for the reverse, unknown otherwise.`;

export const LINES_INSTRUCTIONS = `You classify the rows of a supplier's account statement for an accounting system. The text was already extracted from the PDF.
Money amounts are shown as {amount}; you never see, return or calculate amounts, dates as values, balances or totals.

Each row gives: lineIndex; direction (debit = increases what the customer owes the supplier; credit = reduces it; none = no amount on the row);
balanceJump (true when the row has no amount but the running balance still changes); byColumn (the row's text split under each column heading by horizontal position — usually right, but text that ran together may be split imperfectly); text (the whole row).

For EVERY row return exactly one entry:
- type: invoice | credit_note | debit_note | payment | unallocated_receipt | journal | adjustment | interest | discount | balance_line | unknown.
  Decide from the column structure, the direction and the description together. A debit row carrying a number in the document-number column is an invoice unless its description says otherwise (interest, journal, debit note, adjustment).
  A debit row described as a debit note (debit note, DN) is debit_note.
  Credit rows described as payment, receipt, EFT, transfer, deposit are payments; a credit row that is a credit note says so (credit note, CN, return).
  A credit row whose description does not say what it is (for example "Misc", "Sundry", or only a reference) is unknown with low confidence — never assume it is a payment.
  Rows such as "Unapplied cash", "Unallocated", "On account", "Cash on account" are unallocated_receipt. An unallocated receipt settles nothing yet: put its own number in documentNumberCell and leave paymentAllocatesDocumentNumber null.
  Brought/carried forward or balance-only rows are balance_line. Use unknown when the evidence is not enough — never guess.
- documentNumberCell: the row's own document number copied EXACTLY as printed (keep leading zeros and punctuation), normally from the documentNumber column; null when there is none.
  On a payment row the document-number column usually holds the invoice being paid: put that number in paymentAllocatesDocumentNumber and set documentNumberCell to null unless the row also shows the payment's own number.
- secondaryReferenceCells: the row's other references (supplier reference, customer order / PO) copied exactly; [] when none.
- paymentAllocatesDocumentNumber: for payment or credit_note rows, the document number the row says it settles, copied exactly; otherwise null.
- descriptionMeaning: what the description means, at most 12 words.
- evidence: the headings, words and direction you relied on, at most 20 words.
- confidence: high, medium or low.
Copy identifiers exactly; never invent, complete or reformat one. Return the rows in the order given.`;

// ---------------------------------------------------------------------------------------------
// What is sent: structure only, money masked
// ---------------------------------------------------------------------------------------------

const MASK = "{amount}";
/** Replace every money amount with {amount}; dates and identifiers stay as printed. */
export function maskAmounts(text: string): string {
  const amounts = findAmounts(text);
  if (!amounts.length) return text;
  let out = "";
  let pos = 0;
  for (const a of amounts) {
    // Include a leading "R " / "-R " prefix the amount pattern leaves behind.
    let start = a.start;
    const before = text.slice(0, start);
    const prefix = /-?R\s?$/.exec(before);
    if (prefix) start -= prefix[0].length;
    out += text.slice(pos, start) + MASK;
    pos = a.end;
  }
  return (out + text.slice(pos)).replace(/\s+/g, " ").trim();
}

function directionOf(t: StatementTransaction): "debit" | "credit" | "none" {
  if ((t.debit ?? 0) > 0) return "debit";
  if ((t.credit ?? 0) > 0) return "credit";
  return "none";
}

/** The row's text placed under each heading by horizontal position (token centre → nearest heading start to its left). */
export function splitRowByHeader(cells: PdfCell[], header: PdfCell[] | null): Record<string, string> | null {
  if (!header?.length) return null;
  const cols = [...header].sort((a, b) => a.x0 - b.x0);
  const out: Record<string, string[]> = {};
  for (const cell of cells) {
    const text = maskAmounts(cell.text);
    const tokens = [...text.matchAll(/\S+/g)];
    const width = Math.max(1, cell.x1 - cell.x0);
    const len = Math.max(1, text.length);
    for (const t of tokens) {
      const centre = cell.x0 + (width * (t.index! + t[0].length / 2)) / len;
      let col = cols[0];
      for (const c of cols) if (c.x0 - 2 <= centre) col = c;
      (out[col.text] ||= []).push(t[0]);
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join(" ")]));
}

/** Each row's running-balance movement against the row before it, in display order (deterministic). */
function balanceMovements(transactions: StatementTransaction[]): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 1; i < transactions.length; i++) {
    const t = transactions[i];
    const prev = transactions[i - 1];
    if (t.balance === null || prev.balance === null) continue;
    out.set(t.index, Math.round((t.balance - prev.balance) * 100) / 100);
  }
  return out;
}

function balanceJumps(transactions: StatementTransaction[]): Set<number> {
  const jumps = new Set<number>();
  for (let i = 1; i < transactions.length; i++) {
    const t = transactions[i];
    const prev = transactions[i - 1];
    if (directionOf(t) !== "none" || t.balance === null || prev.balance === null) continue;
    if (Math.abs(t.balance - prev.balance) > 0.01) jumps.add(t.index);
  }
  return jumps;
}

// ---------------------------------------------------------------------------------------------
// Validation against the source text
// ---------------------------------------------------------------------------------------------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The value appears in the text as whole token(s) — not as part of a longer identifier. */
export function appearsIn(text: string, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRe(v)}($|[^A-Za-z0-9])`).test(text);
}
function isMoneyOrDate(value: string): boolean {
  const v = value.trim();
  if (v.includes(MASK)) return true;
  const a = findAmounts(v);
  if (a.length && a[0].start === 0 && a[0].end >= v.replace(/\s+$/, "").length - 2) return true;
  const d = findDates(v);
  return Boolean(d.length && d[0].start === 0 && d[0].end === v.length);
}

/** An identifier the AI cited: kept only if it is printed on the row and is not a date or amount. */
function checkIdentifier(row: string, value: string | null, field: string, lineIndex: number, rejected: StatementInterpretation["rejected"]): string | null {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (v.length < 2 || isMoneyOrDate(v)) {
    rejected.push({ lineIndex, field, value: v, reason: "Not an identifier (a date or amount, or too short)." });
    return null;
  }
  if (!appearsIn(row, v)) {
    rejected.push({ lineIndex, field, value: v, reason: "Not printed on this row of the statement." });
    return null;
  }
  return v;
}

const DEBIT_TYPES: StatementLineType[] = ["invoice", "debit_note", "interest"];
const CREDIT_TYPES: StatementLineType[] = ["payment", "credit_note", "discount"];

// ---------------------------------------------------------------------------------------------
// Deterministic fallback (the reader's own reading)
// ---------------------------------------------------------------------------------------------

function readerType(t: StatementTransaction): StatementLineType {
  switch (t.type) {
    case "INVOICE":
      return "invoice";
    case "CREDIT_NOTE":
      return "credit_note";
    case "PAYMENT":
      return "payment";
    case "OTHER":
      return "adjustment";
    default:
      return "unknown";
  }
}

function readerLine(t: StatementTransaction, reason: string): InterpretedLine {
  return {
    index: t.index,
    page: t.page,
    date: t.date,
    debit: t.debit,
    credit: t.credit,
    balance: t.balance,
    direction: directionOf(t),
    type: readerType(t),
    typeSource: "reader",
    documentNumber: t.reference,
    secondaryReferences: [],
    paymentAllocatesDocumentNumber: null,
    allocationSource: null,
    allocationKind: null,
    allocationNote: null,
    descriptionMeaning: null,
    evidence: null,
    confidence: "low",
    structurallyConfirmed: false,
    balanceMovement: null,
    needsReview: true,
    reviewReasons: [reason],
    auditNotes: [],
    sourceText: t.sourceText,
  };
}

const emptyField = (): ValidatedField => ({ value: null, sourceText: null, rejected: null });

function deterministicOrdering(transactions: StatementTransaction[]): "newest_first" | "oldest_first" | "unknown" {
  const dated = transactions.map((t) => t.date).filter((d): d is string => Boolean(d));
  if (dated.length < 2) return "unknown";
  if (dated[0] > dated[dated.length - 1]) return "newest_first";
  if (dated[0] < dated[dated.length - 1]) return "oldest_first";
  return "unknown";
}

const DOCUMENT_TYPES: StatementLineType[] = ["invoice", "credit_note", "debit_note"];
// Debit rows the AI itself classified as a non-document charge; any other debit outside the population may be a missed supplier document.
const NON_DOCUMENT_DEBITS: StatementLineType[] = ["interest", "journal", "adjustment", "balance_line"];

/**
 * The reconciliation population is supplier documents only. A row outside it (payment, receipt,
 * unapplied cash, balance line, …) raises no review item: what was observed about it is kept as an
 * audit note. The one exception is a row that may itself be a supplier document the reading missed —
 * a debit not explained as a non-document charge, or a credit whose meaning is unknown (a possible
 * credit note) — because a missed document would understate the population.
 */
function confineReviewToDocuments(l: InterpretedLine): InterpretedLine {
  if (DOCUMENT_TYPES.includes(l.type)) return l;
  const possibleDocument =
    (l.direction === "debit" && !(l.typeSource === "ai" && NON_DOCUMENT_DEBITS.includes(l.type))) || (l.direction === "credit" && (l.type === "unknown" || (l.typeSource === "reader" && l.type === "adjustment")));
  const could = l.direction === "debit" ? "invoice or debit note" : "credit note";
  return {
    ...l,
    needsReview: possibleDocument,
    reviewReasons: possibleDocument ? [`A ${l.direction} row read as ${l.type.replace("_", " ")} — it may be a supplier document (${could}); check it before relying on the reconciliation.`] : [],
    auditNotes: [...l.auditNotes, ...l.reviewReasons],
  };
}

function buildResult(extraction: StatementExtraction, input: Partial<StatementInterpretation> & { lines: InterpretedLine[] }): StatementInterpretation {
  const partial = { ...input, lines: input.lines.map(confineReviewToDocuments) };
  const counts = Object.fromEntries(STATEMENT_LINE_TYPES.map((k) => [k, 0])) as Record<StatementLineType, number>;
  for (const l of partial.lines) counts[l.type]++;
  return {
    aiStatus: partial.aiStatus ?? "skipped",
    aiMessage: partial.aiMessage ?? null,
    model: partial.model ?? null,
    usage: partial.usage ?? null,
    metadata: partial.metadata ?? {
      supplierName: emptyField(),
      supplierEmail: emptyField(),
      supplierWebsite: emptyField(),
      supplierVatNumber: emptyField(),
      supplierAccountNumber: emptyField(),
      statementDate: emptyField(),
      periodFrom: emptyField(),
      periodTo: emptyField(),
      currency: emptyField(),
      ordering: deterministicOrdering(extraction.transactions),
    },
    columns: partial.columns ?? [],
    lines: partial.lines,
    rejected: partial.rejected ?? [],
    counts: {
      ...counts,
      needsReview: partial.lines.filter((l) => l.needsReview).length,
      invoicesWithoutDocumentNumber: partial.lines.filter((l) => DOCUMENT_TYPES.includes(l.type) && !l.documentNumber).length,
      aiLines: partial.lines.filter((l) => l.typeSource === "ai").length,
      readerLines: partial.lines.filter((l) => l.typeSource === "reader").length,
    },
  };
}

/** The reader's reading of every row, marked Needs Review, with why the AI was not used. */
export function readerInterpretation(extraction: StatementExtraction, status: AiStatus, message: string): StatementInterpretation {
  return buildResult(extraction, { aiStatus: status, aiMessage: message, lines: extraction.transactions.map((t) => readerLine(t, message)) });
}

// ---------------------------------------------------------------------------------------------
// The AI call (Responses API, strict JSON schema, store:false, timeout, one retry for 429/5xx)
// ---------------------------------------------------------------------------------------------

class StatementAiCallError extends Error {
  constructor(
    readonly status: AiStatus,
    message: string
  ) {
    super(message);
  }
}

type CallResult = { parsed: unknown; inputTokens: number; outputTokens: number };

async function callModel(deps: StatementAiDeps, name: string, schema: unknown, instructions: string, input: string): Promise<CallResult> {
  const body = {
    model: deps.model,
    instructions,
    input: [{ role: "user", content: [{ type: "input_text", text: input }] }],
    temperature: 0,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
    text: { format: { type: "json_schema", name, schema, strict: true } },
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
    let res: Response;
    try {
      res = await deps.fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${deps.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if ((error as { name?: string })?.name === "AbortError") throw new StatementAiCallError("timeout", `The AI did not answer within ${Math.round(deps.timeoutMs / 1000)} seconds.`);
      throw new StatementAiCallError("provider_unavailable", `The AI service could not be reached: ${error instanceof Error ? error.message : String(error)}`);
    }
    clearTimeout(timer);
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt === 1) {
        await new Promise((r) => setTimeout(r, deps.retryDelayMs));
        continue;
      }
      const classified = classifyAiProviderFailure({ status: res.status, body: json });
      throw new StatementAiCallError("provider_unavailable", classified instanceof AiServiceUnavailableError ? classified.operatorMessage : `The AI service returned HTTP ${res.status}.`);
    }
    const usage = (json?.usage || {}) as { input_tokens?: number; output_tokens?: number };
    const tokens = { inputTokens: Number(usage.input_tokens || 0), outputTokens: Number(usage.output_tokens || 0) };
    if (json?.status && json.status !== "completed") throw Object.assign(new StatementAiCallError("invalid_response", `The AI response was ${String(json.status)}.`), tokens);
    const parts = ((json?.output as Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>) || []).flatMap((o) => (o.type === "message" ? o.content || [] : []));
    if (parts.some((p) => p.type === "refusal")) throw Object.assign(new StatementAiCallError("invalid_response", "The AI declined to answer."), tokens);
    const text = parts.filter((p) => p.type === "output_text").map((p) => p.text || "").join("");
    try {
      return { parsed: JSON.parse(text), ...tokens };
    } catch {
      throw Object.assign(new StatementAiCallError("invalid_response", "The AI did not return valid JSON."), tokens);
    }
  }
  throw new StatementAiCallError("provider_unavailable", "The AI service did not answer.");
}

async function inBatches<T, R>(items: T[], concurrency: number, run: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await run(items[i], i);
      }
    })
  );
  return results;
}

// ---------------------------------------------------------------------------------------------
// Interpretation
// ---------------------------------------------------------------------------------------------

type AiStatementAnswer = {
  supplierName: string | null;
  supplierEmail: string | null;
  supplierWebsite: string | null;
  supplierVatNumber: string | null;
  supplierAccountNumber: string | null;
  statementDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  currency: string | null;
  ordering: "newest_first" | "oldest_first" | "unknown";
  columns: Array<{ header: string; role: StatementColumnRole }>;
};
type AiLineAnswer = {
  lineIndex: number;
  type: StatementLineType;
  documentNumberCell: string | null;
  secondaryReferenceCells: string[];
  paymentAllocatesDocumentNumber: string | null;
  descriptionMeaning: string;
  evidence: string;
  confidence: Confidence;
};

function isStatementAnswer(v: unknown): v is AiStatementAnswer {
  const o = v as AiStatementAnswer;
  return Boolean(o) && typeof o === "object" && Array.isArray(o.columns) && ["newest_first", "oldest_first", "unknown"].includes(o.ordering);
}
function isLinesAnswer(v: unknown): v is { transactions: AiLineAnswer[] } {
  const o = v as { transactions?: unknown };
  return Boolean(o) && typeof o === "object" && Array.isArray(o.transactions);
}

/**
 * Interpret a statement the PDF reader has already read. Never throws for an AI problem: the reader's
 * own reading comes back instead, marked Needs Review, with aiStatus saying why.
 */
export async function interpretStatementWithAi(
  extraction: StatementExtraction,
  options: { companyId: string; workspaceId?: string | null; userId?: string | null; ownCompanyNames?: string[]; deps?: Partial<StatementAiDeps> }
): Promise<StatementInterpretation> {
  const deps = { ...defaultDeps(), ...(options.deps || {}) };
  const tx = extraction.transactions;
  if (!tx.length) return readerInterpretation(extraction, "skipped", "No transaction rows were read, so there is nothing to interpret.");
  if (!deps.apiKey) return readerInterpretation(extraction, "no_api_key", "The AI service is not configured on this server; the reader's own reading is shown.");
  const allowance = await deps.checkAllowance({ companyId: options.companyId }).catch(() => null);
  if (!allowance || !allowance.allowed) return readerInterpretation(extraction, "budget_exceeded", "The company's monthly AI allowance is used up; the reader's own reading is shown.");

  const started = Date.now();
  const totals = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const count = (r: { inputTokens?: number; outputTokens?: number }) => {
    totals.calls++;
    totals.inputTokens += Number(r.inputTokens || 0);
    totals.outputTokens += Number(r.outputTokens || 0);
  };
  const finish = async (result: StatementInterpretation, errorMessage: string | null) => {
    const provider = resolveProviderForModel(deps.model);
    const costUsd = computeCostUsd({ promptTokens: totals.inputTokens, completionTokens: totals.outputTokens }, provider, deps.model);
    result.model = deps.model;
    result.usage = { ...totals, costUsd };
    if (totals.calls) {
      await deps
        .recordUsage({
          companyId: options.companyId,
          workspaceId: options.workspaceId ?? null,
          userId: options.userId ?? null,
          productId: "vyron_cost",
          featureId: "supplier_statement",
          provider,
          model: deps.model,
          promptTokens: totals.inputTokens,
          completionTokens: totals.outputTokens,
          totalTokens: totals.inputTokens + totals.outputTokens,
          executionTimeMs: Date.now() - started,
          success: result.aiStatus === "ok" || result.aiStatus === "partial",
          errorMessage,
          metadata: { calls: totals.calls, lines: tx.length, aiStatus: result.aiStatus, statementSha256: extraction.fileSha256 },
        })
        .catch(() => null);
    }
    return result;
  };

  const header = extraction.structure?.headerCells ?? null;
  const own = (options.ownCompanyNames || []).filter(Boolean);
  const contextText = (extraction.structure?.contextLines || []).map((l) => maskAmounts(l.text));
  const rejected: StatementInterpretation["rejected"] = [];

  // 1. Statement identity and column semantics.
  let statement: AiStatementAnswer;
  try {
    const sample = tx.slice(0, 12).map((t) => ({ lineIndex: t.index, direction: directionOf(t), text: maskAmounts(t.sourceText) }));
    const input = JSON.stringify({
      customer: own,
      columnHeadings: (header || []).map((c) => ({ header: c.text, x0: c.x0, x1: c.x1 })),
      statementText: contextText,
      sampleRows: sample,
      rowCount: tx.length,
      firstRowDate: tx[0]?.dateText ?? null,
      lastRowDate: tx[tx.length - 1]?.dateText ?? null,
    });
    const r = await callModel(deps, "supplier_statement_identity", STATEMENT_SCHEMA, STATEMENT_INSTRUCTIONS, input);
    count(r);
    if (!isStatementAnswer(r.parsed)) throw new StatementAiCallError("invalid_response", "The AI's statement answer did not match the schema.");
    statement = r.parsed;
  } catch (error) {
    if (error instanceof StatementAiCallError) {
      count(error as unknown as { inputTokens?: number; outputTokens?: number });
      return finish(readerInterpretation(extraction, error.status, error.message), error.message);
    }
    throw error;
  }

  // Columns: each must be a heading the reader saw; at most one document-number column.
  const headerByText = new Map((header || []).map((c) => [c.text.trim().toLowerCase(), c]));
  const columns: StatementInterpretation["columns"] = [];
  for (const c of statement.columns) {
    const cell = headerByText.get(String(c.header || "").trim().toLowerCase());
    if (!cell || !STATEMENT_COLUMN_ROLES.includes(c.role)) {
      rejected.push({ lineIndex: null, field: "columns", value: String(c.header), reason: cell ? "Unknown role." : "Not a column heading on the statement." });
      continue;
    }
    if (!columns.some((x) => x.header === cell.text)) columns.push({ header: cell.text, role: c.role, x0: cell.x0, x1: cell.x1 });
  }
  if (columns.filter((c) => c.role === "documentNumber").length > 1) {
    rejected.push({ lineIndex: null, field: "columns", value: columns.filter((c) => c.role === "documentNumber").map((c) => c.header).join(", "), reason: "More than one column was called the document number." });
    for (const c of columns) if (c.role === "documentNumber") c.role = "other";
  }
  const docColumn = columns.find((c) => c.role === "documentNumber")?.header ?? null;

  // Statement identity: each value must be written in the statement text; dates parsed by the reader's rules.
  const allText = [...contextText, ...(header || []).map((c) => c.text)].join("\n");
  const ownKeys = own.map((n) => normalisedNameKey(n)).filter(Boolean);
  // A number printed among banking details (bank, branch code, SWIFT / IBAN) is a bank account, not the
  // customer's account with the supplier — whatever the AI called it.
  const ctxLines = extraction.structure?.contextLines || [];
  const bankingNear = (v: string) => {
    const i = ctxLines.findIndex((l) => l.text.includes(v));
    return i >= 0 && ctxLines.slice(Math.max(0, i - 3), i + 2).some((l) => /\b(bank|banking|branch|swift|iban|bic)\b/i.test(l.text));
  };
  const field = (name: string, value: string | null, extra?: (v: string) => string | null): ValidatedField => {
    if (value === null || value === undefined || !String(value).trim()) return emptyField();
    const v = String(value).trim();
    if (!allText.toLowerCase().includes(v.toLowerCase())) {
      rejected.push({ lineIndex: null, field: name, value: v, reason: "Not written in the statement text." });
      return { value: null, sourceText: null, rejected: "Not written in the statement text." };
    }
    const problem = extra ? extra(v) : null;
    if (problem) {
      rejected.push({ lineIndex: null, field: name, value: v, reason: problem });
      return { value: null, sourceText: v, rejected: problem };
    }
    return { value: v, sourceText: v, rejected: null };
  };
  const dateField = (name: string, value: string | null): ValidatedField => {
    const f = field(name, value, (v) => (findDates(v).length ? null : "Not a date."));
    if (!f.value) return f;
    const iso = isoFromText(f.value, extraction.dateOrder);
    return iso ? { value: iso, sourceText: f.sourceText, rejected: null } : { value: null, sourceText: f.sourceText, rejected: "The date could not be read." };
  };
  const detOrdering = deterministicOrdering(tx);
  const metadata: StatementInterpretation["metadata"] = {
    supplierName: field("supplierName", statement.supplierName, (v) => (ownKeys.includes(normalisedNameKey(v)) ? "This is the customer, not the supplier." : null)),
    supplierEmail: field("supplierEmail", statement.supplierEmail, (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "Not an email address.")),
    supplierWebsite: field("supplierWebsite", statement.supplierWebsite),
    supplierVatNumber: field("supplierVatNumber", statement.supplierVatNumber),
    supplierAccountNumber: field("supplierAccountNumber", statement.supplierAccountNumber, (v) => (bankingNear(v) ? "This is a bank account number from the banking details, not the account with the supplier." : null)),
    statementDate: dateField("statementDate", statement.statementDate),
    periodFrom: dateField("periodFrom", statement.periodFrom),
    periodTo: dateField("periodTo", statement.periodTo),
    currency: statement.currency && /^(ZAR|R)$/i.test(statement.currency.trim()) && /(^|\s)-?R\s?\d/.test(tx.map((t) => t.sourceText).join(" ")) ? { value: "ZAR", sourceText: statement.currency, rejected: null } : field("currency", statement.currency),
    ordering: detOrdering !== "unknown" ? detOrdering : statement.ordering,
  };
  if (detOrdering !== "unknown" && statement.ordering !== detOrdering) rejected.push({ lineIndex: null, field: "ordering", value: statement.ordering, reason: `The row dates show ${detOrdering}.` });

  // 2. Rows, in batches.
  const jumps = balanceJumps(tx);
  const movement = balanceMovements(tx);
  const batches: StatementTransaction[][] = [];
  for (let i = 0; i < tx.length; i += deps.batchSize) batches.push(tx.slice(i, i + deps.batchSize));
  const roles = columns.map((c) => ({ header: c.header, role: c.role }));
  const answers = new Map<number, AiLineAnswer>();
  const failures: StatementAiCallError[] = [];
  await inBatches(batches, deps.concurrency, async (batch) => {
    const rows = batch.map((t) => ({ lineIndex: t.index, direction: directionOf(t), balanceJump: jumps.has(t.index), byColumn: splitRowByHeader(t.cells || [], header), text: maskAmounts(t.sourceText) }));
    try {
      const r = await callModel(deps, "supplier_statement_rows", LINES_SCHEMA, LINES_INSTRUCTIONS, JSON.stringify({ columns: roles, customer: own, rows }));
      count(r);
      if (!isLinesAnswer(r.parsed)) throw new StatementAiCallError("invalid_response", "The AI's row answer did not match the schema.");
      const wanted = new Set(batch.map((t) => t.index));
      for (const a of r.parsed.transactions) if (wanted.has(a.lineIndex) && !answers.has(a.lineIndex)) answers.set(a.lineIndex, a);
    } catch (error) {
      if (!(error instanceof StatementAiCallError)) throw error;
      count(error as unknown as { inputTokens?: number; outputTokens?: number });
      failures.push(error);
    }
  });

  // 3. Merge: reader values + validated AI meaning.
  const lines: InterpretedLine[] = tx.map((t) => {
    const a = answers.get(t.index);
    if (!a) return readerLine(t, failures.length ? `The AI did not interpret this row (${failures[0].message}); the reader's own reading is shown.` : "The AI returned no interpretation for this row; the reader's own reading is shown.");
    const reasons: string[] = [];
    const row = t.sourceText;
    const direction = directionOf(t);
    const type: StatementLineType = STATEMENT_LINE_TYPES.includes(a.type) ? a.type : "unknown";
    const before = rejected.length;
    const documentNumber = checkIdentifier(row, a.documentNumberCell, "documentNumberCell", t.index, rejected);
    const secondary = (Array.isArray(a.secondaryReferenceCells) ? a.secondaryReferenceCells : []).map((v) => checkIdentifier(row, v, "secondaryReferenceCells", t.index, rejected)).filter((v): v is string => Boolean(v) && v !== documentNumber);
    let allocates = checkIdentifier(row, a.paymentAllocatesDocumentNumber, "paymentAllocatesDocumentNumber", t.index, rejected);
    if (rejected.length > before) reasons.push("An identifier the AI gave is not printed on this row, so it was not used.");
    if (allocates && !["payment", "credit_note"].includes(type)) {
      rejected.push({ lineIndex: t.index, field: "paymentAllocatesDocumentNumber", value: allocates, reason: type === "unallocated_receipt" ? "An unallocated receipt settles no document." : `A ${type} row does not settle a document.` });
      allocates = null;
    }
    /*
     * Payment allocation is read, not inferred, when the statement has a document-number column: the
     * value in that column on the payment row (its first token, if it is an identifier printed on the
     * row) is the document the payment settles. The AI decided which column that is; it does not get to
     * decide, row by row, whether the number is there — so the same statement always gives the same
     * allocations. Our Reference and other columns are never used for it.
     */
    let allocationSource: "column" | "ai" | null = allocates ? "ai" : null;
    let allocationNote: string | null = null;
    if (type === "payment" && docColumn) {
      const first = (splitRowByHeader(t.cells || [], header)?.[docColumn] || "").split(" ")[0] || "";
      const fromColumn = /\d/.test(first) && first.length >= 2 && !isMoneyOrDate(first) && appearsIn(row, first) ? first : null;
      if (allocates && allocates !== fromColumn) rejected.push({ lineIndex: t.index, field: "paymentAllocatesDocumentNumber", value: allocates, reason: `Replaced by the value under "${docColumn}" on this row (${fromColumn ?? "none"}).` });
      allocates = fromColumn;
      allocationSource = fromColumn ? "column" : null;
      if (!fromColumn) allocationNote = `No document number under "${docColumn}" on this payment row — the statement does not say which invoice it settles.`;
    }
    // The document number should sit in the document-number column when the statement has one.
    if (documentNumber && docColumn) {
      const inColumn = splitRowByHeader(t.cells || [], header)?.[docColumn] || "";
      if (!appearsIn(inColumn, documentNumber)) reasons.push(`The document number is not under the "${docColumn}" heading on this row.`);
    }
    // Type against the row's own direction (deterministic).
    if (DEBIT_TYPES.includes(type) && direction !== "debit") reasons.push(`Read as ${type.replace("_", " ")} but the row is ${direction === "none" ? "without an amount" : "a credit"}.`);
    if (CREDIT_TYPES.includes(type) && direction !== "credit") reasons.push(`Read as ${type.replace("_", " ")} but the row is ${direction === "none" ? "without an amount" : "a debit"}.`);
    if (type === "unallocated_receipt") {
      if (direction === "debit") reasons.push("Read as an unallocated receipt but the row is a debit.");
      reasons.push(direction === "none" ? "Unallocated receipt: no amount is printed on the row although the running balance changes — check how the supplier applied it." : "Unallocated receipt: check how the supplier applied it.");
    }
    if (type === "unknown") reasons.push("The row's meaning could not be established.");
    if (a.confidence === "low") reasons.push("The AI was not confident about this row.");
    if (DOCUMENT_TYPES.includes(type) && !documentNumber) reasons.push(`Identified as ${type === "invoice" ? "an invoice" : type === "credit_note" ? "a credit note" : "a debit note"}, but no document number is printed on the row.`);
    /*
     * Structural confirmation: the document itself proves an invoice when the row is a debit, its
     * validated number sits under the statement's document-number column, the reader found no
     * running-balance break on it, and nothing above contradicts it. AI confidence describes the AI's
     * reading; it does not override that evidence — "medium" is kept for audit but raises no exception.
     */
    const inDocColumn = Boolean(documentNumber && docColumn && appearsIn(splitRowByHeader(t.cells || [], header)?.[docColumn] || "", documentNumber));
    const balanceBreak = t.flags.some((f) => /running balance/i.test(f.message));
    const structurallyConfirmed = type === "invoice" && direction === "debit" && inDocColumn && !balanceBreak && reasons.length === 0;
    if (a.confidence === "medium" && !structurallyConfirmed) reasons.push("The AI was only moderately confident about this row.");
    return {
      index: t.index,
      page: t.page,
      date: t.date,
      debit: t.debit,
      credit: t.credit,
      balance: t.balance,
      direction,
      type,
      typeSource: "ai" as const,
      documentNumber,
      secondaryReferences: secondary,
      paymentAllocatesDocumentNumber: allocates,
      allocationSource,
      allocationKind: null as InterpretedLine["allocationKind"],
      allocationNote,
      descriptionMeaning: String(a.descriptionMeaning || "").slice(0, 160) || null,
      evidence: String(a.evidence || "").slice(0, 240) || null,
      confidence: (["high", "medium", "low"].includes(a.confidence) ? a.confidence : "low") as Confidence,
      structurallyConfirmed,
      balanceMovement: movement.get(t.index) ?? null,
      needsReview: reasons.length > 0,
      reviewReasons: reasons,
      auditNotes: [] as string[],
      sourceText: t.sourceText,
    };
  });

  // What each allocation refers to, from this statement alone (deterministic).
  const invoiceNumbers = new Set(lines.filter((l) => l.type === "invoice" && l.documentNumber).map((l) => l.documentNumber));
  const receiptNumbers = new Set(lines.filter((l) => l.type === "unallocated_receipt" && l.documentNumber).map((l) => l.documentNumber));
  for (const l of lines) {
    if (!l.paymentAllocatesDocumentNumber) continue;
    if (invoiceNumbers.has(l.paymentAllocatesDocumentNumber)) l.allocationKind = "invoice_on_statement";
    else if (receiptNumbers.has(l.paymentAllocatesDocumentNumber)) {
      l.allocationKind = "receipt";
      l.allocationNote = `${l.paymentAllocatesDocumentNumber} is the reference of an unallocated receipt on this statement, not an invoice.`;
    } else l.allocationKind = "document";
  }
  const answered = lines.filter((l) => l.typeSource === "ai").length;
  const status: AiStatus = answered === tx.length ? "ok" : answered > 0 ? "partial" : failures[0]?.status ?? "invalid_response";
  const message = status === "ok" ? null : `${tx.length - answered} of ${tx.length} rows were not interpreted by the AI${failures.length ? ` (${failures[0].message})` : ""}; those show the reader's own reading.`;
  return finish(buildResult(extraction, { aiStatus: status, aiMessage: message, lines, columns, metadata, rejected }), message);
}

/** YYYY-MM-DD from a date written in the statement, using the reader's day/month order. */
function isoFromText(text: string, order: StatementExtraction["dateOrder"]): string | null {
  const d = findDates(text)[0];
  if (!d) return null;
  const valid = (y: number, m: number, day: number) => {
    const dt = new Date(Date.UTC(y, m - 1, day));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day ? dt.toISOString().slice(0, 10) : null;
  };
  if (d.kind !== "numeric") return valid(d.y, d.b, d.a);
  const monthFirst = d.a > 12 ? false : d.b > 12 ? true : order === "month-first";
  return monthFirst ? valid(d.y, d.a, d.b) : valid(d.y, d.b, d.a);
}
