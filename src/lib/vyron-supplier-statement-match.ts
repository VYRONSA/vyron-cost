import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { InterpretedLine, StatementInterpretation } from "@/lib/vyron-supplier-statement-ai";
import { normalisedNameKey } from "@/lib/vyron-supplier-resolution";

/**
 * VOLORA — supplier statement matching (Phase 2), used ONLY by the PDF statement path.
 *
 * Deterministic. The AI interpretation says what each row is and which printed identifiers belong to
 * it; this module decides matches against the supplier invoices VOLORA holds, in a fixed order, and
 * never guesses:
 *
 *   A. supplier + document number (all-digit numbers compared without leading zeros or separators —
 *      000000002252489 = 02252489, 2252489 ≠ 2252498; other numbers as letters and digits);
 *   B. only when A finds nothing: supplier + the row's other printed references (supplier reference,
 *      customer order / PO) against VOLORA invoice numbers and the PO numbers linked to them;
 *   C. only when the row has no document number: supplier + exact amount + date within the window,
 *      and only when exactly one VOLORA invoice fits AND that invoice fits no other row.
 *
 * More than one candidate at any step → Needs Review; nothing is ever chosen among several. No fuzzy
 * or nearest matching, never amount alone. A row whose number VOLORA does not hold but whose amount
 * and date fit a VOLORA invoice numbered differently is Needs Review, not a match.
 *
 * Supplier documents only: the population is the statement's invoices, credit notes and debit notes.
 * Payments, receipts (including unapplied cash) and every other row stay in the extraction for audit
 * but are excluded from matching, counts, exceptions and the differences report. A document matched on
 * its number stays matched on its number: a date or amount that differs in VOLORA is reported against
 * the document (Date Difference / Amount Difference), never as Missing in VOLORA. Nothing here
 * allocates or changes any record. The global CSV / Excel matching (vyron-supplier-reconciliation.ts)
 * is untouched.
 */

export type MatchCandidate = {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  total: number | null;
  supplierName: string | null;
  poNumber: string | null;
  origin: string;
};

export type StatementMatchStatus =
  | "MATCHED"
  | "AMOUNT_DIFFERENCE"
  | "DATE_DIFFERENCE"
  | "NOTE_DIFFERENCE"
  | "DUPLICATE"
  | "MISSING_IN_VOLORA"
  | "NEEDS_REVIEW"
  /** Not a supplier document (payment, receipt, balance line, …): kept in the extraction, never reconciled. */
  | "NOT_RECONCILED";
export type MatchMethod = "document_number" | "reference" | "amount_date" | null;
export type SupplierDocumentType = "invoice" | "credit_note" | "debit_note";

export type LineMatch = {
  index: number;
  status: StatementMatchStatus;
  method: MatchMethod;
  /** Null for rows outside the population (not a supplier document). */
  documentType: SupplierDocumentType | null;
  documentNumber: string | null;
  voloraId: string | null;
  voloraInvoiceNumber: string | null;
  voloraTotal: number | null;
  statementAmount: number | null;
  /** Statement amount minus VOLORA amount, exact to the cent; null when not compared. */
  difference: number | null;
  statementDate: string | null;
  voloraDate: string | null;
  /** Statement date minus VOLORA date, in days; null when either date is missing or not compared. */
  dateDifferenceDays: number | null;
  candidates: number;
  /** True when several VOLORA records carry this document number. */
  duplicateInVolora: boolean;
  /**
   * The VOLORA records this row was compared with: the one identified, or every candidate when none
   * was chosen (duplicate number, several references, several amount + date fits). Reporting only —
   * it never changes the outcome.
   */
  voloraCandidates: VoloraRecord[];
  note: string;
};

/** A VOLORA supplier document as shown on the differences report. */
export type VoloraRecord = { id: string; invoiceNumber: string | null; invoiceDate: string | null; total: number | null; origin: string };

export type DifferenceCategory = Exclude<StatementMatchStatus, "MATCHED" | "NOT_RECONCILED"> | "NOT_ON_STATEMENT";

/** One supplier document on which the statement and VOLORA disagree. */
export type DocumentDifference = {
  category: DifferenceCategory;
  /** Statement row; null for a VOLORA document that is not on the statement. */
  row: number | null;
  documentType: SupplierDocumentType;
  documentNumber: string | null;
  statementDate: string | null;
  voloraDate: string | null;
  dateDifferenceDays: number | null;
  statementAmount: number | null;
  voloraAmount: number | null;
  amountDifference: number | null;
  voloraId: string | null;
  voloraInvoiceNumber: string | null;
  /** Every VOLORA record involved (all of them for a duplicate — none was selected). */
  voloraCandidates: VoloraRecord[];
  /** The row's other printed references (supplier reference, customer order / PO). */
  references: string[];
  /** Why the statement row itself needs review (from the reading), if it does. */
  reviewReasons: string[];
  /** What the row says, as read (description meaning and the evidence relied on). */
  evidence: string | null;
  note: string;
};

export type StatementMatchResult = {
  supplierName: string;
  lines: LineMatch[];
  notOnStatement: MatchCandidate[];
  /** Every supplier document where the statement and VOLORA disagree, in statement order, then VOLORA-only. */
  differences: DocumentDifference[];
  summary: {
    /** The reconciliation population: invoices, credit notes and debit notes on the statement. */
    documents: number;
    invoices: number;
    creditNotes: number;
    debitNotes: number;
    matched: number;
    amountDifferences: number;
    dateDifferences: number;
    duplicates: number;
    missing: number;
    noteDifferences: number;
    needsReview: number;
    notOnStatement: number;
    matchedByDocumentNumber: number;
    matchedByReference: number;
    matchedByAmountDate: number;
    /** Statement rows outside the population (payments, receipts, balance lines, …) — not reconciled. */
    excludedRows: number;
    periodFrom: string | null;
    periodTo: string | null;
  };
};

export const AMOUNT_DATE_WINDOW_DAYS = 7;
export const SUPPLIER_DOCUMENT_TYPES: readonly SupplierDocumentType[] = ["invoice", "credit_note", "debit_note"];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Comparison key for a document number. All-digit numbers (separators ignored) lose leading zeros; others keep letters and digits. */
export function documentKey(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return null;
  const digitsOnly = text.replace(/[\s\-/.]/g, "");
  if (/^\d+$/.test(digitsOnly)) return `N:${digitsOnly.replace(/^0+/, "") || "0"}`;
  const alnum = text.replace(/[^A-Z0-9]/g, "");
  return alnum ? `A:${alnum}` : null;
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const signedDays = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

type DocumentLine = InterpretedLine & { type: SupplierDocumentType };
/** True for the rows in the reconciliation population: invoices, credit notes and debit notes. */
export const isSupplierDocument = (l: InterpretedLine): l is DocumentLine => (SUPPLIER_DOCUMENT_TYPES as readonly string[]).includes(l.type);

/** The amount the statement shows for a document: invoices and debit notes positive, credit notes negative (as VOLORA holds them). */
function statementAmount(l: InterpretedLine): number | null {
  if (l.type === "invoice" || l.type === "debit_note") return l.debit !== null ? r2(l.debit) : null;
  if (l.type === "credit_note") return l.credit !== null ? -r2(l.credit) : null;
  return null;
}

const brief = (c: MatchCandidate): VoloraRecord => ({ id: c.id, invoiceNumber: c.invoiceNumber, invoiceDate: c.invoiceDate, total: c.total === null ? null : r2(Number(c.total)), origin: c.origin });

const label = (t: SupplierDocumentType) => (t === "invoice" ? "Invoice" : t === "credit_note" ? "Credit note" : "Debit note");

/**
 * Match an interpreted statement's supplier documents against VOLORA's supplier invoices for the
 * confirmed supplier. Pure. `supplierName` is the supplier the user confirmed — never the AI's
 * suggestion. Only invoices, credit notes and debit notes are reconciled; payments, receipts and every
 * other row are excluded from matching, counts and differences.
 */
export function matchInterpretedStatement(interpretation: StatementInterpretation, register: MatchCandidate[], supplierName: string, options: { windowDays?: number } = {}): StatementMatchResult {
  const windowDays = options.windowDays ?? AMOUNT_DATE_WINDOW_DAYS;
  const supplierKey = normalisedNameKey(supplierName);
  const pool = register.filter((c) => normalisedNameKey(String(c.supplierName || "")) === supplierKey);
  const byDoc = new Map<string, MatchCandidate[]>();
  const byRef = new Map<string, MatchCandidate[]>();
  const add = (map: Map<string, MatchCandidate[]>, key: string | null, c: MatchCandidate) => {
    if (!key) return;
    const list = map.get(key) || [];
    if (!list.includes(c)) list.push(c);
    map.set(key, list);
  };
  for (const c of pool) {
    add(byDoc, documentKey(c.invoiceNumber), c);
    add(byRef, documentKey(c.invoiceNumber), c);
    add(byRef, documentKey(c.poNumber), c);
  }

  const population = interpretation.lines.filter(isSupplierDocument);
  const docCount = new Map<string, number>();
  for (const l of population) {
    const k = documentKey(l.documentNumber);
    if (k) docCount.set(k, (docCount.get(k) || 0) + 1);
  }

  const used = new Set<string>();
  // VOLORA invoices named in a Needs Review (several candidates) are on the statement, just not decided.
  const implicated = new Set<string>();
  const results = new Map<number, LineMatch>();
  const base = (l: DocumentLine): LineMatch => ({
    index: l.index,
    status: "MISSING_IN_VOLORA",
    method: null,
    documentType: l.type,
    documentNumber: l.documentNumber,
    voloraId: null,
    voloraInvoiceNumber: null,
    voloraTotal: null,
    statementAmount: statementAmount(l),
    difference: null,
    statementDate: l.date,
    voloraDate: null,
    dateDifferenceDays: null,
    candidates: 0,
    duplicateInVolora: false,
    voloraCandidates: [],
    note: "",
  });
  /*
   * A document identified in VOLORA. The identification stands on its own — a wrong date or amount in
   * VOLORA never turns it into Missing in VOLORA; each disagreement is reported against the document.
   * The status names the amount first (it moves the balance owed), then the date; both are always shown.
   */
  const settle = (l: DocumentLine, m: LineMatch, c: MatchCandidate, method: Exclude<MatchMethod, null>, note: string) => {
    used.add(c.id);
    const volora = c.total === null ? null : r2(Number(c.total));
    const diff = m.statementAmount !== null && volora !== null ? r2(m.statementAmount - volora) : null;
    const days = l.date && c.invoiceDate ? signedDays(l.date, c.invoiceDate) : null;
    const amountDiffers = diff !== null && Math.abs(diff) > 0.01;
    const dateDiffers = days !== null && days !== 0;
    const status: StatementMatchStatus = amountDiffers ? (l.type === "invoice" ? "AMOUNT_DIFFERENCE" : "NOTE_DIFFERENCE") : dateDiffers ? "DATE_DIFFERENCE" : "MATCHED";
    const notes = [note];
    if (amountDiffers) notes.push(`Amount: statement ${m.statementAmount!.toFixed(2)}, VOLORA ${volora!.toFixed(2)}, difference ${diff!.toFixed(2)}.`);
    if (dateDiffers) notes.push(`Date: statement ${l.date}, VOLORA ${c.invoiceDate} (${days! > 0 ? "+" : ""}${days} day${Math.abs(days!) === 1 ? "" : "s"}).`);
    results.set(l.index, { ...m, status, method, voloraId: c.id, voloraInvoiceNumber: c.invoiceNumber, voloraTotal: volora, difference: diff, voloraDate: c.invoiceDate, dateDifferenceDays: days, candidates: 1, voloraCandidates: [brief(c)], note: notes.join(" ") });
  };

  // A and B, row by row.
  const awaitingAmountDate: DocumentLine[] = [];
  for (const l of population) {
    const m = base(l);
    const key = documentKey(l.documentNumber);
    if (key && (docCount.get(key) || 0) > 1) {
      // VOLORA records with this number are listed for the report only; a duplicate is never matched.
      results.set(l.index, { ...m, status: "DUPLICATE", voloraCandidates: (byDoc.get(key) || []).map(brief), note: `Document ${l.documentNumber} appears ${docCount.get(key)} times on the statement; none is chosen.` });
      continue;
    }
    if (key) {
      const found = byDoc.get(key) || [];
      if (found.length === 1) {
        settle(l, m, found[0], "document_number", found[0].invoiceNumber === l.documentNumber ? `Matched on document number ${l.documentNumber}.` : `Matched on document number: ${l.documentNumber} on the statement = ${found[0].invoiceNumber} in VOLORA (leading zeros / separators ignored).`);
        continue;
      }
      if (found.length > 1) {
        for (const c of found) implicated.add(c.id);
        const listed = found.map((c) => `${c.invoiceNumber} dated ${c.invoiceDate ?? "—"}, ${c.total === null ? "no total" : r2(Number(c.total)).toFixed(2)}`).join("; ");
        results.set(l.index, { ...m, status: "NEEDS_REVIEW", candidates: found.length, duplicateInVolora: true, voloraCandidates: found.map(brief), note: `Duplicate in VOLORA: ${found.length} records carry document number ${l.documentNumber} (${listed}); none is chosen.` });
        continue;
      }
    }
    const refHits = new Map<string, { c: MatchCandidate; ref: string }>();
    for (const ref of l.secondaryReferences) for (const c of byRef.get(documentKey(ref) || "") || []) refHits.set(c.id, { c, ref });
    if (refHits.size === 1) {
      const { c, ref } = [...refHits.values()][0];
      settle(l, m, c, "reference", `Matched on the row's reference ${ref} (= VOLORA ${c.poNumber && documentKey(c.poNumber) === documentKey(ref) ? `PO ${c.poNumber}` : `invoice ${c.invoiceNumber}`}); the document number ${l.documentNumber ? `${l.documentNumber} is not in VOLORA` : "is not printed"}.`);
      continue;
    }
    if (refHits.size > 1) {
      for (const id of refHits.keys()) implicated.add(id);
      results.set(l.index, { ...m, status: "NEEDS_REVIEW", candidates: refHits.size, voloraCandidates: [...refHits.values()].map((h) => brief(h.c)), note: `The row's references match ${refHits.size} VOLORA invoices; none is chosen.` });
      continue;
    }
    awaitingAmountDate.push(l);
  }

  // C: exact amount + date window, one candidate in both directions.
  const fits = (l: InterpretedLine, c: MatchCandidate) => {
    const amount = statementAmount(l);
    return amount !== null && c.total !== null && Math.abs(r2(Number(c.total)) - amount) < 0.005 && Boolean(l.date && c.invoiceDate) && dayDiff(l.date!, c.invoiceDate!) <= windowDays;
  };
  const free = pool.filter((c) => !used.has(c.id));
  for (const l of awaitingAmountDate) {
    const m = base(l);
    const cands = free.filter((c) => fits(l, c));
    if (!cands.length) {
      results.set(l.index, { ...m, note: l.documentNumber ? `${label(l.type)} ${l.documentNumber} is not in VOLORA.` : `No VOLORA document matches this ${label(l.type).toLowerCase()}.` });
      continue;
    }
    if (cands.length > 1 || l.documentNumber) for (const c of cands) implicated.add(c.id);
    const reverse = cands.length === 1 ? awaitingAmountDate.filter((o) => fits(o, cands[0])).length : 0;
    if (cands.length === 1 && reverse === 1 && !l.documentNumber) {
      settle(l, m, cands[0], "amount_date", `Matched on exact amount and date only (VOLORA invoice ${cands[0].invoiceNumber}, ${cands[0].invoiceDate}) — the statement prints no document number; confirm.`);
      continue;
    }
    results.set(l.index, {
      ...m,
      status: "NEEDS_REVIEW",
      candidates: cands.length,
      voloraCandidates: cands.map(brief),
      note: l.documentNumber
        ? `Document ${l.documentNumber} is not in VOLORA, but the amount and date fit ${cands.length === 1 ? `VOLORA invoice ${cands[0].invoiceNumber}` : `${cands.length} VOLORA invoices`} — check which is right.`
        : `The amount and date fit ${cands.length} VOLORA invoice(s) and ${reverse || "more than one"} statement row(s); none is chosen.`,
    });
  }

  const lines: LineMatch[] = interpretation.lines.map(
    (l) =>
      results.get(l.index) || {
        index: l.index,
        status: "NOT_RECONCILED",
        method: null,
        documentType: null,
        documentNumber: l.documentNumber,
        voloraId: null,
        voloraInvoiceNumber: null,
        voloraTotal: null,
        statementAmount: null,
        difference: null,
        statementDate: l.date,
        voloraDate: null,
        dateDifferenceDays: null,
        candidates: 0,
        duplicateInVolora: false,
        voloraCandidates: [],
        note: "Not a supplier document — excluded from reconciliation.",
      }
  );
  const dates = population.map((l) => l.date).filter((d): d is string => Boolean(d)).sort();
  const periodFrom = dates[0] ?? null;
  const periodTo = dates[dates.length - 1] ?? null;
  const notOnStatement = pool.filter((c) => !used.has(c.id) && !implicated.has(c.id) && c.invoiceDate && periodFrom && periodTo && c.invoiceDate >= periodFrom && c.invoiceDate <= periodTo);
  const documentLines = lines.filter((x) => x.documentType !== null);
  const rowOf = new Map(population.map((l) => [l.index, l]));
  const evidenceOf = (l: InterpretedLine | undefined) => [l?.descriptionMeaning, l?.evidence].filter(Boolean).join(" — ") || null;
  const differences: DocumentDifference[] = [
    ...documentLines
      .filter((x) => x.status !== "MATCHED")
      .map((x) => ({
        category: x.status as DifferenceCategory,
        row: x.index,
        documentType: x.documentType!,
        documentNumber: x.documentNumber,
        statementDate: x.statementDate,
        voloraDate: x.voloraDate,
        dateDifferenceDays: x.dateDifferenceDays,
        statementAmount: x.statementAmount,
        voloraAmount: x.voloraTotal,
        amountDifference: x.difference,
        voloraId: x.voloraId,
        voloraInvoiceNumber: x.voloraInvoiceNumber,
        voloraCandidates: x.voloraCandidates,
        references: rowOf.get(x.index)?.secondaryReferences ?? [],
        reviewReasons: rowOf.get(x.index)?.reviewReasons ?? [],
        evidence: evidenceOf(rowOf.get(x.index)),
        note: x.note,
      })),
    ...notOnStatement.map((c) => ({
      category: "NOT_ON_STATEMENT" as const,
      row: null,
      documentType: (c.total !== null && Number(c.total) < 0 ? "credit_note" : "invoice") as SupplierDocumentType,
      documentNumber: c.invoiceNumber,
      statementDate: null,
      voloraDate: c.invoiceDate,
      dateDifferenceDays: null,
      statementAmount: null,
      voloraAmount: c.total === null ? null : r2(Number(c.total)),
      amountDifference: null,
      voloraId: c.id,
      voloraInvoiceNumber: c.invoiceNumber,
      voloraCandidates: [brief(c)],
      references: c.poNumber ? [`PO ${c.poNumber}`] : [],
      reviewReasons: [],
      evidence: null,
      note: "In VOLORA for this supplier and period, but not on the supplier statement.",
    })),
  ];
  const count = (s: StatementMatchStatus) => documentLines.filter((x) => x.status === s).length;
  return {
    supplierName,
    lines,
    notOnStatement,
    differences,
    summary: {
      documents: population.length,
      invoices: population.filter((l) => l.type === "invoice").length,
      creditNotes: population.filter((l) => l.type === "credit_note").length,
      debitNotes: population.filter((l) => l.type === "debit_note").length,
      matched: count("MATCHED"),
      amountDifferences: count("AMOUNT_DIFFERENCE"),
      dateDifferences: count("DATE_DIFFERENCE"),
      duplicates: count("DUPLICATE"),
      missing: count("MISSING_IN_VOLORA"),
      noteDifferences: count("NOTE_DIFFERENCE"),
      needsReview: count("NEEDS_REVIEW"),
      notOnStatement: notOnStatement.length,
      matchedByDocumentNumber: documentLines.filter((x) => x.method === "document_number").length,
      matchedByReference: documentLines.filter((x) => x.method === "reference").length,
      matchedByAmountDate: documentLines.filter((x) => x.method === "amount_date").length,
      excludedRows: interpretation.lines.length - population.length,
      periodFrom,
      periodTo,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The reviewed interpretation travels to approval signed: AI output is not byte-for-byte repeatable,
// so approval verifies the exact interpretation the user reviewed instead of asking the AI again.
// ---------------------------------------------------------------------------------------------

const REVIEW_TTL_MS = 24 * 60 * 60 * 1000;

function reviewKey(): Buffer | null {
  const dedicated = process.env.VYRON_WORKSPACE_SESSION_SECRET?.trim();
  const source = dedicated && dedicated.length >= 32 ? dedicated : process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!source || source.length < 32) return null;
  return Buffer.from(hkdfSync("sha256", source, "volora-supplier-statement", "statement-interpretation-review-v1", 32));
}

export type ReviewPayload = { v: 1; companyId: string; extractionDigest: string; fileSha256: string; issuedAt: number; interpretation: StatementInterpretation };

/** Sign the interpretation shown for review. Returns null when the server has no signing secret. */
export function signReviewedInterpretation(input: Omit<ReviewPayload, "v" | "issuedAt">): { body: string; signature: string } | null {
  const key = reviewKey();
  if (!key) return null;
  const body = JSON.stringify({ v: 1, issuedAt: Date.now(), ...input } satisfies ReviewPayload);
  return { body, signature: createHmac("sha256", key).update(body).digest("base64url") };
}

/** The reviewed interpretation, if the signature is valid, fresh and for this company; otherwise null. */
export function verifyReviewedInterpretation(body: string, signature: string, expect: { companyId: string }): ReviewPayload | null {
  const key = reviewKey();
  if (!key || !body || !signature) return null;
  const expected = createHmac("sha256", key).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: ReviewPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return null;
  }
  if (payload?.v !== 1 || payload.companyId !== expect.companyId || !payload.interpretation || Date.now() - Number(payload.issuedAt) > REVIEW_TTL_MS) return null;
  return payload;
}
