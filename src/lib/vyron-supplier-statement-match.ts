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
 * and date fit a VOLORA invoice numbered differently is Needs Review, not a match. Payments and
 * unallocated receipts are carried as statement evidence only; nothing here allocates or changes any
 * record. The global CSV / Excel matching (vyron-supplier-reconciliation.ts) is untouched.
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

export type StatementMatchStatus = "MATCHED" | "TOTAL_DIFFERENCE" | "MISSING_IN_VOLORA" | "DUPLICATE" | "CREDIT_NOTE" | "NEEDS_REVIEW" | "NOT_RECONCILED";
export type MatchMethod = "document_number" | "reference" | "amount_date" | null;

export type LineMatch = {
  index: number;
  status: StatementMatchStatus;
  method: MatchMethod;
  voloraId: string | null;
  voloraInvoiceNumber: string | null;
  voloraTotal: number | null;
  statementAmount: number | null;
  difference: number | null;
  candidates: number;
  note: string;
};

export type StatementMatchResult = {
  supplierName: string;
  lines: LineMatch[];
  notOnStatement: MatchCandidate[];
  summary: {
    statementInvoices: number;
    matched: number;
    matchedByDocumentNumber: number;
    matchedByReference: number;
    matchedByAmountDate: number;
    totalDifferences: number;
    missing: number;
    duplicates: number;
    creditNotes: number;
    needsReview: number;
    notOnStatement: number;
    paymentsWithAllocation: number;
    unallocatedReceipts: number;
    periodFrom: string | null;
    periodTo: string | null;
  };
};

export const AMOUNT_DATE_WINDOW_DAYS = 7;
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

/** The amount the statement shows for a row: invoices positive, credit notes negative (as VOLORA holds them). */
function statementAmount(l: InterpretedLine): number | null {
  if (l.type === "invoice") return l.debit !== null ? r2(l.debit) : null;
  if (l.type === "credit_note") return l.credit !== null ? -r2(l.credit) : null;
  return null;
}

/**
 * Match an interpreted statement against VOLORA's supplier invoices for the confirmed supplier. Pure.
 * `supplierName` is the supplier the user confirmed — never the AI's suggestion.
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

  const reconcilable = interpretation.lines.filter((l) => l.type === "invoice" || l.type === "credit_note");
  const docCount = new Map<string, number>();
  for (const l of reconcilable) {
    const k = documentKey(l.documentNumber);
    if (k) docCount.set(k, (docCount.get(k) || 0) + 1);
  }

  const used = new Set<string>();
  // VOLORA invoices named in a Needs Review (several candidates) are on the statement, just not decided.
  const implicated = new Set<string>();
  const results = new Map<number, LineMatch>();
  const base = (l: InterpretedLine): LineMatch => ({ index: l.index, status: "MISSING_IN_VOLORA", method: null, voloraId: null, voloraInvoiceNumber: null, voloraTotal: null, statementAmount: statementAmount(l), difference: null, candidates: 0, note: "" });
  const settle = (l: InterpretedLine, m: LineMatch, c: MatchCandidate, method: Exclude<MatchMethod, null>, note: string) => {
    used.add(c.id);
    const volora = c.total === null ? null : r2(Number(c.total));
    const diff = m.statementAmount !== null && volora !== null ? r2(m.statementAmount - volora) : null;
    const status: StatementMatchStatus = l.type === "credit_note" ? "CREDIT_NOTE" : diff !== null && Math.abs(diff) > 0.01 ? "TOTAL_DIFFERENCE" : "MATCHED";
    results.set(l.index, { ...m, status, method, voloraId: c.id, voloraInvoiceNumber: c.invoiceNumber, voloraTotal: volora, difference: diff, candidates: 1, note: diff !== null && Math.abs(diff) > 0.01 ? `${note} The statement differs from VOLORA by ${diff.toFixed(2)}.` : note });
  };

  // A and B, row by row.
  const awaitingAmountDate: InterpretedLine[] = [];
  for (const l of reconcilable) {
    const m = base(l);
    const key = documentKey(l.documentNumber);
    if (key && (docCount.get(key) || 0) > 1) {
      results.set(l.index, { ...m, status: "DUPLICATE", note: `Document ${l.documentNumber} appears ${docCount.get(key)} times on the statement.` });
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
        results.set(l.index, { ...m, status: "NEEDS_REVIEW", candidates: found.length, note: `${found.length} VOLORA invoices (${found.map((c) => c.invoiceNumber).join(", ")}) have number ${l.documentNumber} when leading zeros are ignored; none is chosen.` });
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
      results.set(l.index, { ...m, status: "NEEDS_REVIEW", candidates: refHits.size, note: `The row's references match ${refHits.size} VOLORA invoices; none is chosen.` });
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
      results.set(l.index, { ...m, note: l.documentNumber ? `Document ${l.documentNumber} is not in VOLORA.` : "No VOLORA invoice matches this row." });
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
      note: l.documentNumber
        ? `Document ${l.documentNumber} is not in VOLORA, but the amount and date fit ${cands.length === 1 ? `VOLORA invoice ${cands[0].invoiceNumber}` : `${cands.length} VOLORA invoices`} — check which is right.`
        : `The amount and date fit ${cands.length} VOLORA invoice(s) and ${reverse || "more than one"} statement row(s); none is chosen.`,
    });
  }

  const lines: LineMatch[] = interpretation.lines.map((l) => results.get(l.index) || { ...base(l), status: "NOT_RECONCILED", statementAmount: null, note: "" });
  const dates = reconcilable.map((l) => l.date).filter((d): d is string => Boolean(d)).sort();
  const periodFrom = dates[0] ?? null;
  const periodTo = dates[dates.length - 1] ?? null;
  const notOnStatement = pool.filter((c) => !used.has(c.id) && !implicated.has(c.id) && c.invoiceDate && periodFrom && periodTo && c.invoiceDate >= periodFrom && c.invoiceDate <= periodTo);
  const count = (s: StatementMatchStatus) => lines.filter((x) => x.status === s).length;
  return {
    supplierName,
    lines,
    notOnStatement,
    summary: {
      statementInvoices: reconcilable.length,
      matched: count("MATCHED"),
      matchedByDocumentNumber: lines.filter((x) => x.method === "document_number").length,
      matchedByReference: lines.filter((x) => x.method === "reference").length,
      matchedByAmountDate: lines.filter((x) => x.method === "amount_date").length,
      totalDifferences: count("TOTAL_DIFFERENCE"),
      missing: count("MISSING_IN_VOLORA"),
      duplicates: count("DUPLICATE"),
      creditNotes: count("CREDIT_NOTE"),
      needsReview: count("NEEDS_REVIEW"),
      notOnStatement: notOnStatement.length,
      // Payments the statement links to a document — counting only invoices, never a receipt reference.
      paymentsWithAllocation: interpretation.lines.filter((l) => l.type === "payment" && l.paymentAllocatesDocumentNumber && l.allocationKind !== "receipt").length,
      unallocatedReceipts: interpretation.lines.filter((l) => l.type === "unallocated_receipt").length,
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
