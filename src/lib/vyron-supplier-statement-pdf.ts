import { createHash } from "node:crypto";
import { normalisedNameKey } from "@/lib/vyron-supplier-resolution";

/**
 * VOLORA — supplier statement PDF extraction (supplier-agnostic, text layer only).
 *
 * Reads the text layer of a supplier statement PDF and interprets its structure without assuming
 * a supplier, column order, column names, date format or page layout:
 *
 *   1. Text items are grouped into lines (by vertical position) and cells (by horizontal gaps).
 *   2. A column-heading row is recognised from a broad vocabulary (Date / Doc No / Reference /
 *      Description / Type / Debit / Credit / Amount / Balance …, in any order, repeated per page).
 *      Without one, lines that start with a date and carry amounts are read by position — and the
 *      document says so.
 *   3. Dates: ISO, numeric (day/month order decided per document from the dates themselves) and
 *      month-name forms. Amounts: two decimals, comma or point decimals, space / comma / point
 *      thousands, R prefix, minus, brackets and CR / DR suffixes.
 *   4. Statement fields (supplier, statement date, period, opening and closing balance) come from
 *      labels; balances carried / brought forward at page breaks are recognised as such.
 *   5. The statement's own running balance and opening + movements = closing are checked, so a
 *      misread value is flagged instead of passing silently.
 *
 * Nothing is guessed: a value that cannot be read with confidence is flagged, and an "error" flag
 * keeps the line out of any reconciliation. A PDF without a usable text layer (a scan) is refused —
 * there is no OCR. This module reads bytes and returns data; it never touches a database.
 */

export class StatementPdfError extends Error {}

export const STATEMENT_PDF_MAX_BYTES = 5 * 1024 * 1024;
export const STATEMENT_PDF_MAX_PAGES = 50;

export type FlagSeverity = "error" | "warning";
export type Flag = { severity: FlagSeverity; message: string };
export type StatementField<T> = { value: T | null; source: string | null; page: number | null; flag: string | null };

export type StatementTransactionType = "INVOICE" | "CREDIT_NOTE" | "PAYMENT" | "OTHER" | "UNKNOWN";
/** RECONCILE: an invoice or credit note that will be reconciled. NOT_RECONCILED: a payment / journal (read, not matched to invoices). EXCLUDED: could not be read with confidence. */
export type StatementLineStatus = "RECONCILE" | "NOT_RECONCILED" | "EXCLUDED";

export type StatementTransaction = {
  index: number;
  page: number;
  date: string | null;
  dateText: string | null;
  dueDate: string | null;
  reference: string | null;
  description: string | null;
  typeText: string | null;
  type: StatementTransactionType;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  status: StatementLineStatus;
  flags: Flag[];
  sourceText: string;
};

export type UnreadLine = { page: number; text: string; reason: string };

export type StatementExtraction = {
  fileSha256: string;
  pageCount: number;
  layout: "columns" | "rows" | "none";
  columns: string[];
  dateOrder: "day-first" | "month-first" | "unambiguous";
  supplier: StatementField<string> & { candidates: string[] };
  accountNumber: StatementField<string>;
  statementDate: StatementField<string>;
  periodFrom: StatementField<string>;
  periodTo: StatementField<string>;
  openingBalance: StatementField<number>;
  closingBalance: StatementField<number>;
  balanceCheck: { opening: number | null; movements: number; computedClosing: number | null; closing: number | null; agrees: boolean | null; difference: number | null };
  transactions: StatementTransaction[];
  unreadLines: UnreadLine[];
  warnings: string[];
  counts: { transactions: number; toReconcile: number; notReconciled: number; excluded: number; withWarnings: number };
  digest: string;
};

// ---------------------------------------------------------------------------------------------
// Text layer → lines and cells
// ---------------------------------------------------------------------------------------------

export type PdfCell = { text: string; x0: number; x1: number };
export type PdfLine = { page: number; y: number; h: number; cells: PdfCell[]; text: string };

type RawItem = { str: string; x: number; y: number; w: number; h: number };

/** Group one page's text items into lines (top to bottom) and cells (left to right). Pure. */
export function groupTextItems(page: number, items: RawItem[]): PdfLine[] {
  const usable = items.filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: RawItem[][] = [];
  for (const item of usable) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) <= Math.max(2, 0.5 * Math.max(row[0].h, item.h))) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    const h = Math.max(...row.map((i) => i.h), 1);
    const cells: PdfCell[] = [];
    for (const item of row) {
      const last = cells[cells.length - 1];
      const gap = last ? item.x - last.x1 : Infinity;
      if (last && gap <= 1.2 * h) {
        const space = gap > 0.15 * h && !last.text.endsWith(" ") && !item.str.startsWith(" ") ? " " : "";
        last.text += space + item.str;
        last.x1 = Math.max(last.x1, item.x + item.w);
      } else cells.push({ text: item.str, x0: item.x, x1: item.x + item.w });
    }
    for (const c of cells) c.text = c.text.replace(/\s+/g, " ").trim();
    const kept = cells.filter((c) => c.text);
    return { page, y: row[0].y, h, cells: kept, text: kept.map((c) => c.text).join("  ") };
  });
}

/** Read the text layer of a PDF as lines. Refuses encrypted, oversized and scanned (text-less) PDFs. */
export async function readPdfLines(bytes: Uint8Array): Promise<{ pageCount: number; lines: PdfLine[] }> {
  if (!bytes || bytes.byteLength === 0) throw new StatementPdfError("The file is empty.");
  if (bytes.byteLength > STATEMENT_PDF_MAX_BYTES) throw new StatementPdfError("The PDF is larger than 5 MB.");
  if (!isPdfBytes(bytes)) throw new StatementPdfError("The file is not a PDF.");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // standardFontDataUrl is deliberately not set: text positions do not need font data, and the
  // path does not exist inside a deployed function (see vyron-document-page-images.ts).
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  let pdf: Awaited<typeof task.promise>;
  try {
    pdf = await task.promise;
  } catch (error) {
    const name = (error as { name?: string })?.name || "";
    if (/password/i.test(name)) throw new StatementPdfError("The PDF is password-protected. Upload an unprotected copy of the statement.");
    throw new StatementPdfError("The PDF could not be read.");
  }
  try {
    if (pdf.numPages > STATEMENT_PDF_MAX_PAGES) throw new StatementPdfError(`The PDF has ${pdf.numPages} pages; a statement can have at most ${STATEMENT_PDF_MAX_PAGES}.`);
    const lines: PdfLine[] = [];
    let chars = 0;
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items: RawItem[] = [];
      for (const raw of content.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
        if (typeof raw.str !== "string" || !raw.transform) continue;
        const [, , c, d, e, f] = raw.transform;
        const h = raw.height || Math.hypot(c, d) || 10;
        items.push({ str: raw.str, x: e, y: f, w: raw.width || raw.str.length * h * 0.5, h });
        chars += raw.str.replace(/\s/g, "").length;
      }
      lines.push(...groupTextItems(p, items));
    }
    const withDigits = lines.filter((l) => /\d/.test(l.text)).length;
    if (chars < 40 * pdf.numPages * 0.5 || withDigits < 2)
      throw new StatementPdfError(
        "This PDF has no usable text layer — it appears to be a scanned or photographed statement. VOLORA does not read scans: upload the supplier's original (digital) PDF, or a CSV / Excel export."
      );
    return { pageCount: pdf.numPages, lines };
  } finally {
    try {
      const disposable = (pdf as unknown as { destroy?: () => Promise<void> }).destroy ? (pdf as unknown as { destroy: () => Promise<void> }) : (task as unknown as { destroy?: () => Promise<void> });
      await disposable.destroy?.();
    } catch {
      // cleanup must never replace a result
    }
  }
}

export function isPdfBytes(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d; // %PDF-
}

export function isPdfUpload(file: { name?: string | null; type?: string | null }): boolean {
  return String(file.type || "").toLowerCase() === "application/pdf" || /\.pdf$/i.test(String(file.name || ""));
}

// ---------------------------------------------------------------------------------------------
// Tokens: amounts and dates
// ---------------------------------------------------------------------------------------------

export type AmountToken = { value: number; raw: string; start: number; end: number };

const AMOUNT_RE = /(?<![\w.,/-])(\(?)(-?)(R\s?)?(\d{1,3}(?:[  ,.]\d{3})+|\d+)([.,])(\d{2})(?!\d)(?![.,/-]\d)(\)?)(-?)(\s?(?:CR|Cr|cr|DR|Dr|dr)\b)?/g;

/** Every money amount in a text (two decimals required, so codes and quantities are not amounts). */
export function findAmounts(text: string): AmountToken[] {
  const out: AmountToken[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const [raw, open, minus, , int, decSep, dec, close, trailMinus, suffix] = m;
    const thousand = /[  ,.]/.exec(int)?.[0];
    if (thousand && thousand.trim() === decSep) continue; // "1.234.56" — separators conflict
    if (thousand && thousand !== " " && thousand !== " " && int.split(thousand).slice(1).some((g) => g.length !== 3)) continue;
    if (open && !close) continue;
    const value = Number(int.replace(/[  ,.]/g, "")) + Number(dec) / 100;
    const negative = Boolean(open && close) || Boolean(minus) || Boolean(trailMinus) || /cr/i.test(suffix || "");
    out.push({ value: negative ? -value : value, raw: raw.trim(), start: m.index!, end: m.index! + raw.length });
  }
  return out;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const monthNumber = (s: string): number | null => {
  const k = s.toLowerCase().replace(/\.$/, "");
  if (MONTHS[k]) return MONTHS[k];
  const full = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(k);
  return full >= 0 ? full + 1 : null;
};

export type DateToken = { raw: string; start: number; end: number; kind: "iso" | "numeric" | "named"; a: number; b: number; y: number };

/** Every date in a text. Numeric dates keep both parts; the day/month order is decided per document. */
export function findDates(text: string): DateToken[] {
  const out: DateToken[] = [];
  const taken = (s: number, e: number) => out.some((d) => s < d.end && e > d.start);
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  for (const m of text.matchAll(/(?<![\d.,])(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d])/g)) out.push({ raw: m[0], start: m.index!, end: m.index! + m[0].length, kind: "iso", a: Number(m[3]), b: Number(m[2]), y: Number(m[1]) });
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([A-Za-z]{3,9})\.?[\s\-/.,]+(\d{4}|\d{2})(?![\d.,])/g)) {
    const mon = monthNumber(m[2]);
    if (mon && !taken(m.index!, m.index! + m[0].length)) out.push({ raw: m[0], start: m.index!, end: m.index! + m[0].length, kind: "named", a: Number(m[1]), b: mon, y: year(m[3]) });
  }
  for (const m of text.matchAll(/(?<![A-Za-z])([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?![\d])/g)) {
    const mon = monthNumber(m[1]);
    if (mon && !taken(m.index!, m.index! + m[0].length)) out.push({ raw: m[0], start: m.index!, end: m.index! + m[0].length, kind: "named", a: Number(m[2]), b: mon, y: Number(m[3]) });
  }
  for (const m of text.matchAll(/(?<![\d.,/-])(\d{1,2})([-/.])(\d{1,2})\2(\d{4}|\d{2})(?![\d]|[.,]\d)/g))
    if (!taken(m.index!, m.index! + m[0].length)) out.push({ raw: m[0], start: m.index!, end: m.index! + m[0].length, kind: "numeric", a: Number(m[1]), b: Number(m[3]), y: year(m[4]) });
  return out.sort((x, y) => x.start - y.start);
}

const isoDate = (y: number, m: number, d: number): string | null => {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
};

type DateOrder = "day-first" | "month-first" | "conflict" | "unknown";

/** A date token as YYYY-MM-DD, or why it cannot be read. */
function resolveDate(t: DateToken, order: DateOrder): { value: string | null; problem: string | null } {
  if (t.kind === "iso") return { value: isoDate(t.y, t.b, t.a), problem: isoDate(t.y, t.b, t.a) ? null : `"${t.raw}" is not a real date.` };
  if (t.kind === "named") return { value: isoDate(t.y, t.b, t.a), problem: isoDate(t.y, t.b, t.a) ? null : `"${t.raw}" is not a real date.` };
  const ambiguous = t.a <= 12 && t.b <= 12 && t.a !== t.b;
  if (ambiguous && order === "conflict") return { value: null, problem: `"${t.raw}" could be day/month or month/day, and the statement uses both orders.` };
  const monthFirst = t.a > 12 ? false : t.b > 12 ? true : order === "month-first";
  const value = monthFirst ? isoDate(t.y, t.a, t.b) : isoDate(t.y, t.b, t.a);
  return { value, problem: value ? null : `"${t.raw}" is not a real date.` };
}

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

type Role = "date" | "due" | "reference" | "description" | "type" | "debit" | "credit" | "amount" | "balance";
const AMOUNT_ROLES: Role[] = ["debit", "credit", "amount", "balance"];
const TEXT_ROLES: Role[] = ["reference", "description", "type"];
const DATE_ROLES: Role[] = ["date", "due"];

const HEADER_VOCAB: Array<[Role, RegExp]> = [
  ["due", /^(due( date)?|payment due|due by)$/],
  ["date", /^((trans(action)?|txn|doc(ument)?|inv(oice)?|posting|tran) )?date$|^date of (invoice|transaction)$/],
  ["type", /^((trans(action)?|txn|doc(ument)?|tran) )?type$|^(tx|trn|tr)$/],
  ["reference", /^(ref(erence)?|doc(ument)?( (no|number|ref|#))?|inv(oice)?( (no|number|ref|#))?|trans(action)? (no|number|ref)|txn (no|ref)|your ref(erence)?|our ref(erence)?|number|no|#|folio|voucher( no)?)$/],
  ["description", /^(description|details|narration|particulars|transaction|memo|comment|transaction details)$/],
  ["debit", /^(debits?|dr|charges?|invoiced|amount dr|debit amount)$/],
  ["credit", /^(credits?|cr|payments?( \/ credits)?|payments? (and|&) credits|receipts?|amount cr|credit amount)$/],
  ["amount", /^(amount|value|total|invoice (amount|total)|amount (incl|incl vat|inc vat|zar|r)|transaction amount|gross)$/],
  ["balance", /^((running|cumulative|outstanding) )?bal(ance)?$|^balance (due|zar|r)$/],
];

const headerRole = (text: string): Role | null => {
  const t = text.toLowerCase().replace(/[:.()]/g, "").replace(/\s+/g, " ").trim();
  for (const [role, re] of HEADER_VOCAB) if (re.test(t)) return role;
  return null;
};

const OPENING_RE = /(opening bal(ance)?|balance (brought )?(b\/f|bf|b\/fwd|brought forward|forward|from previous( statement)?)|brought forward|previous balance|balance b\/f|\bb\/f\b|\bb\/fwd\b|\bo\/b\b|balance at start)/i;
const CARRIED_RE = /(carried forward|\bc\/f\b|\bc\/fwd\b|balance c\/f|continued on next page)/i;
const CLOSING_RE = /(closing bal(ance)?|balance (due|owing|outstanding|payable|now due)|amount (now )?(due|owing|payable|outstanding)|total (amount )?(due|outstanding|owing|payable)|please pay|pay this amount|balance to pay|total balance|account balance|outstanding balance)/i;
const TOTAL_RE = /^\s*(sub[- ]?)?totals?\b(?!.*\b(due|outstanding|owing|payable)\b)/i;
const AGEING_RE = /\b(current|30 days|60 days|90 days|120\+? days|over 90|ageing|aging)\b/gi;
const AGEING_WORD = /\b(current|30 days|60 days|90 days|120\+? days|over 90|ageing|aging)\b/i;
const STATEMENT_DATE_RE = /(statement date|date of statement|statement as at|as at|statement dated)/i;
const PERIOD_RE = /(statement period|for the period|period|from)\b/i;
const MONTH_PERIOD_RE = /(for the month of|month ending|period ending|month:|statement for)\s*:?\s*/i;
const ACCOUNT_RE = /(account (no|number|#|code)|acc(ount)?\.? no|customer (no|code|number|account|ref)|debtor (code|no|account))\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/]{1,30})/i;
const BOILERPLATE_RE = /^(page \d+( of \d+)?|continued|\d+ of \d+|e&oe|e & oe)$/i;

const CUSTOMER_LABEL_RE = /^(to|bill to|billed to|statement to|customer( name)?|account name|client|deliver(y)? to|sold to|attention|attn)\b\s*:?\s*/i;
const SUPPLIER_LABEL_RE = /^(from|supplier( name)?|remit to|payable to|vendor|creditor)\b\s*:?\s*/i;
const ENTITY_RE = /^(.{2,80}?\b(\(pty\)\s*ltd\.?|pty\.?\s*ltd\.?|\(pty\)\s*limited|\(proprietary\)\s*limited|proprietary limited|limited|ltd\.?|cc|inc\.?|llc|plc|npc|\(rf\)\s*\(pty\)\s*ltd))(\s+t\/a\s+.{2,60})?/i;

function classifyType(typeText: string | null, reference: string | null, description: string | null): { type: StatementTransactionType; certain: boolean } {
  const t = String(typeText || "").toLowerCase().trim();
  const ref = String(reference || "").toUpperCase();
  const d = String(description || "").toLowerCase();
  const all = `${t} ${d}`;
  if (/credit\s*note|\bcrn\b|\bc\/n\b|^cn$|^cr$|^crd$|\breturns?\b/.test(t) || /credit\s*note|\bc\/n\b/.test(d) || /^(CN|CRN|CR|CRD)[-\s/]?\d/.test(ref)) return { type: "CREDIT_NOTE", certain: true };
  if (/payment|receipt|\bpmt\b|\brcpt?\b|^pay$|^py$|\beft\b|deposit|remittance|\bpaid\b|thank you/.test(all) || /^(PMT|RCP|RCT|PAY|EFT)[-\s/]?\d/.test(ref)) return { type: "PAYMENT", certain: true };
  if (/journal|\bjnl\b|\bjv\b|^jn$|discount|interest|adjust|write.?off|rebate|settlement|debit\s*note|\bdn\b|reversal|refund|charge(s)? levied|admin fee/.test(all) || /^(JNL|JV|DN|ADJ)[-\s/]?\d/.test(ref)) return { type: "OTHER", certain: true };
  if (/invoice|\binv\b|^in$|^ti$|^tax inv|^sale|^sales$/.test(t) || /\b(tax )?invoice\b/.test(d) || /^(INV|IN|TI|SI)[-\s/]?\d/.test(ref)) return { type: "INVOICE", certain: true };
  return { type: "UNKNOWN", certain: false };
}

/** "INV-001236 Goods supplied" → reference + description. */
function splitReference(text: string): { reference: string | null; rest: string } {
  const m = /^((?:[A-Z]{1,6}[-\s/#]?)?\d[\w\-/.#]*)\s*(.*)$/i.exec(text.trim());
  if (m && /\d/.test(m[1]) && m[1].length >= 3) return { reference: m[1].replace(/[.,;:]$/, ""), rest: m[2].trim() };
  return { reference: null, rest: text.trim() };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------------
// Interpretation
// ---------------------------------------------------------------------------------------------

type Column = { role: Role; x0: number; x1: number; label: string };
type Piece = { kind: "date"; token: DateToken; x: number } | { kind: "amount"; token: AmountToken; x: number } | { kind: "text"; text: string; x: number; x0: number; x1: number };

/** Split a line into dates, amounts and text fragments, each with an x position. */
function piecesOf(line: PdfLine): Piece[] {
  const out: Piece[] = [];
  for (const cell of line.cells) {
    const len = Math.max(cell.text.length, 1);
    const xAt = (i: number) => cell.x0 + ((cell.x1 - cell.x0) * i) / len;
    const dates = findDates(cell.text);
    const amounts = findAmounts(cell.text).filter((a) => !dates.some((d) => a.start < d.end && a.end > d.start));
    const spans = [...dates.map((d) => ({ s: d.start, e: d.end })), ...amounts.map((a) => ({ s: a.start, e: a.end }))].sort((a, b) => a.s - b.s);
    for (const d of dates) out.push({ kind: "date", token: d, x: (xAt(d.start) + xAt(d.end)) / 2 });
    for (const a of amounts) out.push({ kind: "amount", token: a, x: (xAt(a.start) + xAt(a.end)) / 2 });
    let pos = 0;
    for (const sp of [...spans, { s: cell.text.length, e: cell.text.length }]) {
      const frag = cell.text.slice(pos, sp.s).trim();
      if (frag && /[A-Za-z0-9]/.test(frag)) out.push({ kind: "text", text: frag, x: (xAt(pos) + xAt(sp.s)) / 2, x0: xAt(pos), x1: xAt(sp.s) });
      pos = Math.max(pos, sp.e);
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

function nearestColumn(columns: Column[], roles: Role[], x: number): Column | null {
  let best: Column | null = null;
  let bestDistance = Infinity;
  for (const c of columns) {
    if (!roles.includes(c.role)) continue;
    const distance = x >= c.x0 && x <= c.x1 ? 0 : Math.min(Math.abs(x - c.x0), Math.abs(x - c.x1), Math.abs(x - (c.x0 + c.x1) / 2));
    if (distance < bestDistance) {
      best = c;
      bestDistance = distance;
    }
  }
  return best;
}

function headerColumns(line: PdfLine): Column[] | null {
  if (findAmounts(line.text).length) return null;
  const columns: Column[] = [];
  for (const cell of line.cells) {
    // A cell may hold two headings close together ("Date  Reference"); try the cell, then its words.
    const role = headerRole(cell.text);
    if (role) columns.push({ role, x0: cell.x0, x1: cell.x1, label: cell.text });
  }
  const roles = new Set(columns.map((c) => c.role));
  const hasDate = roles.has("date") || roles.has("due");
  const hasAmount = AMOUNT_ROLES.some((r) => roles.has(r));
  return hasDate && hasAmount && columns.length >= 3 ? columns : null;
}

function ageingTotal(lines: PdfLine[], i: number): { value: number; source: string } | null {
  const labels = lines[i].text.match(AGEING_RE);
  if (!labels || labels.length < 2) return null;
  const header = lines[i];
  const totalCell = header.cells.find((c) => /\b(total|balance|amount due|due)\b/i.test(c.text) && !AGEING_WORD.test(c.text));
  const next = lines[i + 1];
  if (!next || next.page !== header.page) return null;
  const amounts = piecesOf(next).filter((p): p is Extract<Piece, { kind: "amount" }> => p.kind === "amount");
  if (!amounts.length) return null;
  if (totalCell) {
    const cx = (totalCell.x0 + totalCell.x1) / 2;
    const nearest = amounts.reduce((a, b) => (Math.abs(b.x - cx) < Math.abs(a.x - cx) ? b : a));
    return { value: nearest.token.value, source: `${header.text} / ${next.text}` };
  }
  return null;
}

/** Interpret a statement from its text lines. Pure and deterministic. */
export function interpretStatement(input: { lines: PdfLine[]; pageCount: number; fileSha256: string; ownCompanyNames?: string[] }): StatementExtraction {
  const { lines } = input;
  const warnings: string[] = [];
  const unreadLines: UnreadLine[] = [];
  const ownKeys = (input.ownCompanyNames || []).map((n) => normalisedNameKey(n)).filter(Boolean);

  // -- Date order, from the document's own numeric dates.
  let dayFirstEvidence = 0;
  let monthFirstEvidence = 0;
  for (const l of lines)
    for (const d of findDates(l.text))
      if (d.kind === "numeric") {
        if (d.a > 12 && d.b <= 12) dayFirstEvidence++;
        if (d.b > 12 && d.a <= 12) monthFirstEvidence++;
      }
  const order: DateOrder = dayFirstEvidence && monthFirstEvidence ? "conflict" : dayFirstEvidence ? "day-first" : monthFirstEvidence ? "month-first" : "unknown";
  const hasAmbiguousNumeric = lines.some((l) => findDates(l.text).some((d) => d.kind === "numeric" && d.a <= 12 && d.b <= 12 && d.a !== d.b));
  if (order === "unknown" && hasAmbiguousNumeric) warnings.push("The statement's dates do not show whether they are day/month or month/day; they are read day-first (the South African convention). Check the dates below.");
  if (order === "conflict") warnings.push("The statement uses both day/month and month/day dates; dates that could be either are not read.");

  // -- Column layout.
  const headerIdx = new Set<number>();
  let firstHeader = -1;
  lines.forEach((l, i) => {
    if (headerColumns(l)) {
      headerIdx.add(i);
      if (firstHeader < 0) firstHeader = i;
    }
  });
  const layout: StatementExtraction["layout"] = firstHeader >= 0 ? "columns" : "rows";
  if (layout === "rows") warnings.push("No column headings were found; transaction lines are read by position (a line that starts with a date and carries amounts; when it has two, the last is the running balance). Check them against the PDF.");

  // -- Statement fields.
  const field = <T,>(): StatementField<T> => ({ value: null, source: null, page: null, flag: null });
  const statementDate = field<string>();
  const periodFrom = field<string>();
  const periodTo = field<string>();
  const accountNumber = field<string>();
  const opening = field<number>();
  const closing = field<number>();
  const closingCandidates: Array<{ value: number; source: string; page: number; carried: boolean }> = [];
  const resolveFirst = (text: string) => {
    for (const t of findDates(text)) {
      const r = resolveDate(t, order);
      if (r.value) return r.value;
    }
    return null;
  };

  // -- Supplier, from the top of page 1 (before the transactions).
  const topEnd = firstHeader >= 0 ? firstHeader : Math.min(lines.length, 30);
  const candidates: string[] = [];
  let explicitSupplier: { name: string; source: string } | null = null;
  let customerLines = 0;
  for (let i = 0; i < topEnd; i++) {
    const l = lines[i];
    if (l.page !== 1) break;
    for (const cell of l.cells) {
      const text = cell.text;
      if (CUSTOMER_LABEL_RE.test(text)) {
        customerLines = 2; // the label line and the next line name the customer
        continue;
      }
      const supplierLabel = SUPPLIER_LABEL_RE.exec(text);
      if (supplierLabel && text.slice(supplierLabel[0].length).trim().length > 2 && !explicitSupplier) {
        const name = text.slice(supplierLabel[0].length).trim();
        if (!ownKeys.includes(normalisedNameKey(name))) explicitSupplier = { name, source: text };
        continue;
      }
      if (customerLines > 0 || /\bbank\b|branch|swift|account holder|vat (no|number|reg)|reg(istration)? (no|number)/i.test(text)) continue;
      const m = ENTITY_RE.exec(text);
      if (m) {
        const name = (m[1] + (m[3] || "")).replace(/^(statement|tax invoice|customer statement)\s*[-:]?\s*/i, "").trim();
        const k = normalisedNameKey(name);
        if (k && !ownKeys.includes(k) && !candidates.some((c) => normalisedNameKey(c) === k)) candidates.push(name);
      }
    }
    if (customerLines > 0) customerLines--;
  }
  const supplier: StatementExtraction["supplier"] = { ...field<string>(), candidates };
  if (explicitSupplier) Object.assign(supplier, { value: explicitSupplier.name, source: explicitSupplier.source, page: 1 });
  else if (candidates.length === 1) Object.assign(supplier, { value: candidates[0], source: "Company name at the top of page 1", page: 1 });
  else if (candidates.length > 1) Object.assign(supplier, { value: null, page: 1, flag: `Several company names were found (${candidates.join("; ")}). Choose the supplier.` });
  else supplier.flag = "No supplier name was found on the statement. Enter the supplier.";

  // -- Walk the lines.
  const transactions: StatementTransaction[] = [];
  let columns: Column[] | null = null;
  let inTable = false;
  let afterTable = false;
  let lastTxnLine: PdfLine | null = null;
  const txnRegionEnd = { seen: false };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;
    if (BOILERPLATE_RE.test(text.trim())) continue;
    if (headerIdx.has(i)) {
      columns = headerColumns(line);
      inTable = true;
      afterTable = false;
      lastTxnLine = null;
      continue;
    }

    // Labelled statement fields (anywhere).
    if (!statementDate.value && STATEMENT_DATE_RE.test(text)) {
      const v = resolveFirst(text.slice(text.search(STATEMENT_DATE_RE)));
      if (v) Object.assign(statementDate, { value: v, source: text, page: line.page });
    }
    if (!statementDate.value && i < topEnd && /^date\s*:?/i.test(text.trim())) {
      const v = resolveFirst(text);
      if (v) Object.assign(statementDate, { value: v, source: text, page: line.page });
    }
    if (!periodFrom.value && PERIOD_RE.test(text) && !OPENING_RE.test(text)) {
      const ds = findDates(text.slice(text.search(PERIOD_RE))).map((d) => resolveDate(d, order).value).filter((v): v is string => Boolean(v));
      if (ds.length >= 2) {
        Object.assign(periodFrom, { value: ds[0], source: text, page: line.page });
        Object.assign(periodTo, { value: ds[1], source: text, page: line.page });
      }
    }
    if (!periodFrom.value && MONTH_PERIOD_RE.test(text)) {
      const rest = text.slice(text.search(MONTH_PERIOD_RE));
      const mm = /([A-Za-z]{3,9})\.?\s+(\d{4})/.exec(rest.replace(MONTH_PERIOD_RE, ""));
      const full = findDates(rest)[0];
      if (full && /ending/i.test(rest)) {
        const end = resolveDate(full, order).value;
        if (end) {
          Object.assign(periodFrom, { value: `${end.slice(0, 8)}01`, source: text, page: line.page });
          Object.assign(periodTo, { value: end, source: text, page: line.page });
        }
      } else if (mm && monthNumber(mm[1])) {
        const y = Number(mm[2]);
        const m = monthNumber(mm[1])!;
        Object.assign(periodFrom, { value: isoDate(y, m, 1), source: text, page: line.page });
        Object.assign(periodTo, { value: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10), source: text, page: line.page });
      }
    }
    if (!accountNumber.value) {
      const m = ACCOUNT_RE.exec(text);
      if (m) Object.assign(accountNumber, { value: m[6], source: text, page: line.page });
    }

    const amounts = findAmounts(text).filter((a) => !findDates(text).some((d) => a.start < d.end && a.end > d.start));
    const lastAmount = amounts.length ? amounts[amounts.length - 1].value : null;
    const nextLineAmount = () => {
      const n = lines[i + 1];
      if (!n || n.page !== line.page) return null;
      const a = findAmounts(n.text);
      return a.length === 1 && !findDates(n.text).length ? a[0].value : null;
    };

    const ageing = ageingTotal(lines, i);
    if (ageing) {
      closingCandidates.push({ value: ageing.value, source: ageing.source, page: line.page, carried: false });
      inTable = false;
      afterTable = true;
      i++; // the amounts row belongs to the ageing table
      continue;
    }
    if (OPENING_RE.test(text)) {
      const v = lastAmount ?? nextLineAmount();
      if (v !== null && opening.value === null) Object.assign(opening, { value: v, source: text, page: line.page });
      continue;
    }
    if (CARRIED_RE.test(text)) {
      if (lastAmount !== null) closingCandidates.push({ value: lastAmount, source: text, page: line.page, carried: true });
      continue;
    }
    if (CLOSING_RE.test(text) && !(layout === "columns" && inTable && findDates(text).length && amounts.length > 1)) {
      const v = lastAmount ?? nextLineAmount();
      if (v !== null) closingCandidates.push({ value: v, source: text, page: line.page, carried: false });
      continue;
    }
    if (TOTAL_RE.test(text)) {
      lastTxnLine = null;
      continue;
    }

    const pieces = piecesOf(line);
    const dates = pieces.filter((p): p is Extract<Piece, { kind: "date" }> => p.kind === "date");
    const amountPieces = pieces.filter((p): p is Extract<Piece, { kind: "amount" }> => p.kind === "amount");
    const texts = pieces.filter((p): p is Extract<Piece, { kind: "text" }> => p.kind === "text");

    const isTxnCandidate =
      layout === "columns"
        ? inTable && dates.length > 0 && (amountPieces.length > 0 || texts.length > 0)
        : dates.length > 0 && amountPieces.length > 0 && line.cells[0] && findDates(line.cells[0].text).some((d) => d.start === 0);

    if (!isTxnCandidate) {
      // A wrapped description line directly under a transaction.
      if (lastTxnLine && !dates.length && !amountPieces.length && lastTxnLine.page === line.page && lastTxnLine.y - line.y <= 1.9 * line.h && transactions.length) {
        const t = transactions[transactions.length - 1];
        t.description = [t.description, text.replace(/\s{2,}/g, " ")].filter(Boolean).join(" ");
        t.sourceText += ` / ${text}`;
        lastTxnLine = line;
        continue;
      }
      lastTxnLine = null;
      const inRegion = layout === "columns" ? inTable : transactions.length > 0 && !txnRegionEnd.seen;
      if (inRegion && amountPieces.length && !afterTable) unreadLines.push({ page: line.page, text, reason: dates.length ? "Has a date and amounts but does not fit the statement's columns." : "Has amounts but no date; it is not read as a transaction." });
      else if (inRegion && layout === "columns" && dates.length && !amountPieces.length && !texts.length) unreadLines.push({ page: line.page, text, reason: "Has a date but nothing else that can be read." });
      continue;
    }

    // -- A transaction line.
    const flags: Flag[] = [];
    let date: string | null = null;
    let dateText: string | null = null;
    let dueDate: string | null = null;
    let reference: string | null = null;
    let description: string | null = null;
    let typeText: string | null = null;
    let debit = 0;
    let credit = 0;
    let balance: number | null = null;
    let amountRead = false;

    const addSigned = (v: number) => {
      if (v >= 0) debit += v;
      else credit += -v;
    };
    if (layout === "columns" && columns) {
      for (const d of dates) {
        const col = nearestColumn(columns, DATE_ROLES, d.x);
        const r = resolveDate(d.token, order);
        if (r.problem) flags.push({ severity: col?.role === "due" ? "warning" : "error", message: r.problem });
        if (col?.role === "due") dueDate = dueDate ?? r.value;
        else if (!dateText) {
          date = r.value;
          dateText = d.token.raw;
        }
      }
      for (const a of amountPieces) {
        const col = nearestColumn(columns, AMOUNT_ROLES, a.x);
        const v = a.token.value;
        if (!col) continue;
        amountRead = amountRead || col.role !== "balance";
        if (col.role === "balance") balance = v;
        else if (col.role === "debit") addSigned(v);
        else if (col.role === "credit") credit += Math.abs(v);
        else addSigned(v);
      }
      const byRole: Partial<Record<Role, string[]>> = {};
      for (const t of texts) {
        const col = nearestColumn(columns, TEXT_ROLES, t.x);
        const role = col?.role ?? "description";
        (byRole[role] ||= []).push(t.text);
      }
      typeText = byRole.type?.join(" ") || null;
      const refText = byRole.reference?.join(" ") || null;
      description = byRole.description?.join(" ") || null;
      if (refText) {
        const split = splitReference(refText);
        reference = split.reference ?? (/\d/.test(refText) ? refText : null);
        if (split.reference && split.rest) description = [split.rest, description].filter(Boolean).join(" ");
        if (!reference) description = [refText, description].filter(Boolean).join(" ");
      }
      if (!reference && description && !columns.some((c) => c.role === "reference")) {
        const split = splitReference(description);
        if (split.reference) {
          reference = split.reference;
          description = split.rest || null;
          flags.push({ severity: "warning", message: "The statement has no reference column; the reference is taken from the start of the description." });
        }
      }
    } else {
      const first = dates[0];
      const r = resolveDate(first.token, order);
      date = r.value;
      dateText = first.token.raw;
      if (r.problem) flags.push({ severity: "error", message: r.problem });
      const textAll = texts.map((t) => t.text).join(" ");
      const split = splitReference(textAll);
      reference = split.reference;
      description = split.rest || null;
      const values = amountPieces.map((a) => a.token.value);
      if (values.length === 1) {
        addSigned(values[0]);
        amountRead = true;
      } else if (values.length === 2) {
        addSigned(values[0]);
        balance = values[1];
        amountRead = true;
      } else flags.push({ severity: "error", message: `${values.length} amounts on a line without column headings; which is the transaction amount cannot be told.` });
    }

    if (!amountRead && !flags.some((f) => f.severity === "error")) flags.push({ severity: "error", message: "No transaction amount could be read on this line." });
    const cls = classifyType(typeText, reference, description);
    let type = cls.type;
    if (type === "UNKNOWN" && amountRead) {
      if (debit > 0 && credit === 0) {
        type = "INVOICE";
        flags.push({ severity: "warning", message: "The line does not say what it is; it is taken as an invoice because it increases the balance (debit)." });
      } else if (credit > 0 && debit === 0) flags.push({ severity: "error", message: "A credit without a type: it could be a payment or a credit note, so it is not reconciled." });
    }
    if ((type === "INVOICE" || type === "CREDIT_NOTE") && !reference) flags.push({ severity: "error", message: "No invoice / document number could be read, so the line cannot be matched." });
    if (type === "INVOICE" && credit > 0 && debit === 0) flags.push({ severity: "warning", message: "Described as an invoice but shown as a credit." });
    if (type === "CREDIT_NOTE" && debit > 0 && credit === 0) flags.push({ severity: "warning", message: "Described as a credit note but shown as a debit." });

    const status: StatementLineStatus = flags.some((f) => f.severity === "error") ? "EXCLUDED" : type === "INVOICE" || type === "CREDIT_NOTE" ? "RECONCILE" : "NOT_RECONCILED";
    transactions.push({
      index: transactions.length + 1,
      page: line.page,
      date,
      dateText,
      dueDate,
      reference,
      description,
      typeText,
      type,
      debit: amountRead ? r2(debit) : null,
      credit: amountRead ? r2(credit) : null,
      balance,
      status,
      flags,
      sourceText: text,
    });
    lastTxnLine = line;
  }
  if (layout === "rows" && !transactions.length) warnings.push("No transaction lines could be recognised in this statement.");

  // -- Opening and closing.
  if (opening.value === null) opening.flag = "No opening / brought-forward balance was found on the statement.";
  const finals = closingCandidates.filter((c) => !c.carried);
  const finalValues = [...new Set(finals.map((c) => c.value))];
  if (finalValues.length === 1) Object.assign(closing, { value: finals[finals.length - 1].value, source: finals[finals.length - 1].source, page: finals[finals.length - 1].page });
  else if (finalValues.length > 1) Object.assign(closing, { value: null, page: finals[finals.length - 1].page, flag: `Different closing balances are shown: ${finals.map((c) => `${c.value.toFixed(2)} ("${c.source}")`).join(", ")}.` });
  else {
    const carried = closingCandidates.filter((c) => c.carried);
    if (carried.length) closing.flag = "Only a carried-forward balance was found, not a closing balance.";
    else closing.flag = "No closing balance / amount due was found on the statement.";
  }

  // -- Period from the transactions when the statement does not state it.
  if (!periodFrom.value) {
    const ds = transactions.map((t) => t.date).filter((d): d is string => Boolean(d)).sort();
    if (ds.length) {
      Object.assign(periodFrom, { value: ds[0], source: "Earliest transaction date", page: null });
      Object.assign(periodTo, { value: ds[ds.length - 1], source: "Latest transaction date", page: null });
    }
  }

  // -- The statement's own arithmetic.
  let prev = opening.value;
  let movements = 0;
  for (const t of transactions) {
    if (t.debit === null || t.credit === null) {
      prev = t.balance ?? null;
      continue;
    }
    const move = r2(t.debit - t.credit);
    movements = r2(movements + move);
    if (t.balance !== null) {
      if (prev !== null && Math.abs(r2(prev + move) - t.balance) > 0.01)
        t.flags.push({ severity: "warning", message: `The running balance on the statement is ${t.balance.toFixed(2)}; the previous balance plus this line gives ${r2(prev + move).toFixed(2)}. A value on this line may be misread.` });
      prev = t.balance;
    } else if (prev !== null) prev = r2(prev + move);
  }
  const unreadAmounts = transactions.some((t) => t.debit === null);
  const computed = opening.value !== null && !unreadAmounts ? r2(opening.value + movements) : null;
  const difference = computed !== null && closing.value !== null ? r2(closing.value - computed) : null;
  const agrees = difference === null ? null : Math.abs(difference) <= 0.01;
  if (agrees === false) warnings.push(`Opening balance plus the lines read (${computed!.toFixed(2)}) does not equal the closing balance (${closing.value!.toFixed(2)}); difference ${difference!.toFixed(2)}. A line may be missing or misread.`);
  if (unreadAmounts) warnings.push("Some lines have no readable amount, so the statement's balances cannot be checked.");

  const columnsFound = [...new Set(lines.filter((_, i) => headerIdx.has(i)).flatMap((l) => (headerColumns(l) || []).map((c) => c.role)))];
  const body = {
    fileSha256: input.fileSha256,
    pageCount: input.pageCount,
    layout: transactions.length || layout === "columns" ? layout : ("none" as const),
    columns: columnsFound,
    dateOrder: (order === "month-first" ? "month-first" : order === "unknown" && !hasAmbiguousNumeric ? "unambiguous" : "day-first") as StatementExtraction["dateOrder"],
    supplier,
    accountNumber,
    statementDate,
    periodFrom,
    periodTo,
    openingBalance: opening,
    closingBalance: closing,
    balanceCheck: { opening: opening.value, movements, computedClosing: computed, closing: closing.value, agrees, difference },
    transactions,
    unreadLines,
    warnings,
    counts: {
      transactions: transactions.length,
      toReconcile: transactions.filter((t) => t.status === "RECONCILE").length,
      notReconciled: transactions.filter((t) => t.status === "NOT_RECONCILED").length,
      excluded: transactions.filter((t) => t.status === "EXCLUDED").length,
      withWarnings: transactions.filter((t) => t.flags.some((f) => f.severity === "warning")).length,
    },
  };
  return { ...body, digest: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
}

/** Read and interpret a supplier statement PDF. Writes nothing. */
export async function extractSupplierStatementPdf(bytes: Uint8Array, options: { ownCompanyNames?: string[] } = {}): Promise<StatementExtraction> {
  const { pageCount, lines } = await readPdfLines(bytes);
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  return interpretStatement({ lines, pageCount, fileSha256, ownCompanyNames: options.ownCompanyNames });
}
