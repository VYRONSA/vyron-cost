# Supplier Invoice Extraction — architecture reference

Authoritative reference for the extraction engine. Supersedes earlier
descriptions of the line-item pipeline.

## The problem this architecture solves

Scanned supplier invoices were sent to OpenAI as whole PDFs. The page is
downsampled before the model sees it, a dense priced table stops being legible,
and the model does not report that — it returns invented values at high
confidence.

Measured on Gourmet Foods invoice `02252489` (document
`f9967375-3eec-41ac-86f4-1eccc2568339`), a 200 DPI scan with no text layer:

- `vatAmount / unitPrice = 0.1400` on 11 of 12 rows — South Africa's *pre-2018*
  VAT rate, applied to the unit price. That figure appears nowhere on the page.
- Stored VAT was `30` on 14 of 15 rows. The invoice has a **WEIGHT** column
  between `UNIT PRICE` and `V.A.T.`, and two rows carry a printed weight of
  `30.00`.
- At `temperature: 0`, two runs returned `109.50` and `97.14` as the same unit
  price. The truth is `70.59`.
- `confidenceScore` was `95` on every fabricated row.

Every check in place at the time passed. Row counts matched, header totals were
correct, JSON was valid. The failure was invisible.

## Pipeline

```
document bytes
      |
      v
classify  ── searchable-pdf ─────────────────────> existing whole-document path
      |     (text layer >= 200 chars)
      |
      +──── scanned-pdf / image
                  |
                  v
      whole-document pass  (header fields + first line-item attempt)
                  |
                  v
      arithmetic validation  ──── passes ────────> persist
                  |
                  | fails
                  v
      recover full-resolution page image
                  |
                  v
      locate table (downscaled)  ->  crop at full resolution (top-biased padding)
                  |
                  v
      read: column identity first, then rows
                  |
                  v
      reconciliation retry (same crop) if rows are short
                  |
                  v
      re-validate; adopt only if arithmetic improved
                  |
                  v
      persist + capture evidence
```

### Classification — `vyron-document-page-images.ts`

| Class | Meaning | Path |
|---|---|---|
| `searchable-pdf` | text layer ≥ 200 characters | existing path, unchanged |
| `scanned-pdf` | no text layer, page image recovered | vision path available |
| `image` | uploaded as PNG/JPG | vision path available |
| `unreadable-pdf` | no text layer, no recoverable image | falls back to existing path |

Scanned pages are recovered **losslessly** from the embedded JPEG rather than
re-rendered. There is no generation loss, no resampling of the digits the whole
fix depends on, and no native canvas dependency. Vector PDFs have a text layer
and take the exact path instead.

### Table localisation — `vyron-invoice-table-vision.ts`

Two passes. The locate pass runs against a downscaled copy, because a bounding
box does not need legible digits. The read pass always runs against original
pixels.

Padding around the located box is **asymmetric** — 6% top, 5% bottom, 2% sides.
Both were added in response to measured failures: top padding because a clipped
heading made the model read `NETT PRICE` as `VAT PRICE` and take two values from
the wrong column; bottom padding because a clipped final row was silently lost.

Measured on the reference invoice, same model, same document:

| Input | Cells correct | Rows |
|---|---|---|
| whole scanned PDF (old path) | ~25% | 12–15 of 16 |
| full-resolution whole page | 90.6% | 15 of 16 |
| full-resolution cropped table | **100%** | **16 of 16** |

### Column identity

The read prompt asks for the printed column headings *before* any value, then
for an explicit mapping from heading to canonical field. `weight` is a named
target so a weight column is accounted for and cannot be mistaken for money. Any
field without a clear printed column must be returned as `UNKNOWN`.

This is the direct countermeasure to the root cause: the failure was not bad OCR
of a digit, it was reading the right digit from the wrong column.

### Arithmetic validation — `assessLineArithmetic`

Independent of row counts and header totals, which a mis-mapped column leaves
intact. Three signals:

1. **Constant money column.** A repeated `unitPrice` or `vatAmount` across ≥60%
   of rows, with ≥5 rows and ≥3 distinct line totals. A per-line amount is a
   function of its line. A column of zeros is exempt — that is a zero-rated
   invoice, not a mis-read.
2. **Row coherence.** `quantity × unitPrice` must reconcile to the line total,
   with or without VAT. Both readings are accepted: suppliers differ on whether
   the final column includes VAT. Below 60% coherence the table is rejected.
3. **Line VAT against header VAT**, outside a 2% tolerance.

Failure raises `COLUMN_MAPPING_FAILED` and marks the extraction `Incomplete`.

Rows that individually fail coherence while the table passes are named in
`incoherentRows` and surfaced as an operator warning rather than a rejection —
discarding 15 good rows to re-read 1 is not an improvement.

### Reconciliation basis

Line totals reconcile against **subtotal or total**, whichever is closer.
Gourmet Foods prints a VAT-inclusive `NETT PRICE` summing to the total; others
print an exclusive `Amount` summing to the subtotal. Reconciling only against
the subtotal rejected a verified-correct extraction and drove a retry loop
chasing rows that were never missing.

### Retry strategy

Retries fire on **deterministic validation failure only** — never on model
self-reported confidence, which was 95 on every fabricated row.

- Whole-document path: up to 3 attempts (primary, primary reinforced, fallback).
- Table re-read: one retry against the cached crop when the model returns fewer
  rows than it declared, or when single-page line totals fall short of the
  invoice total.

**Measured and rejected:** escalating to the table re-read after the first
whole-page attempt cut the reference invoice from 119.7s to 45.3s and dropped
accuracy from 64/64 to 47/64. The whole-page attempts feed the re-read; starting
from a single weaker attempt degrades it. Do not reintroduce without re-running
the corpus.

### Evidence capture — `vyron-extraction-evidence.ts`

Retained automatically when a run retries, fails arithmetic, fails column
mapping, is incomplete, or is an operator re-extract:

raw model responses (untruncated, every attempt) · normalized extraction ·
arithmetic report · column mapping · retry history · rendered crops · vision
classification

Structured evidence goes to `vyron_document_extraction_logs.metadata` (already
`jsonb`); crops go to the documents bucket under `diagnostics/<documentId>/`.
**No schema change.** Healthy runs record metrics only — that is also exactly
the set nobody ever opens.

### Diagnostics — `/api/developer/extraction-diagnostics`

Platform session required, read-only, outside the operator workflow. Without a
`documentId` it lists recent runs with dashboard aggregates; with one it returns
the full evidence record and short-lived signed URLs for the crops.

## Monitoring

`buildMonitoringRecord` writes per run: vision class, models attempted, attempt
and retry counts, whether the table re-read ran, arithmetic status and coherent
row counts, column-mapping failure, completeness, declared vs extracted row
counts, duration, token usage, success.

## Performance

Measured on the reference invoice (scanned, 16 rows, worst case — every retry
and the table re-read):

| Metric | Value |
|---|---|
| Wall clock | 98–120s |
| Tokens | ~45,800 |
| OpenAI calls | 3 whole-page + 1 locate + 1–2 read |

A healthy document is unchanged: one call. A searchable PDF never enters the
vision path.

**Known risk:** worst case has been measured at 119.7s against the extract
route's `maxDuration = 120`. There is almost no margin. Options are to raise
`maxDuration` (plan-dependent) or move extraction to a background job. This is
tracked rather than paid for in accuracy — see the rejected optimisation above.

## Regression corpus

`docs/evidence/corpus/`, run with `scripts/run-extraction-regression.mjs`.

Ground truth comes from a real invoice read by a human, and is accepted only
once it reconciles against the invoice's own printed totals. An answer key
produced by the extractor would certify its own mistakes.

Current benchmark, Gourmet Foods `02252489`: **16/16 rows, 63–64/64 cells across
runs, arithmetic Pass.** The engine is not bit-deterministic; the observed
variance is a single misread quantity, which the per-row coherence warning now
surfaces to the operator.

## Files

| File | Role |
|---|---|
| `src/lib/vyron-document-extraction.ts` | engine, validation, retry, orchestration |
| `src/lib/vyron-document-page-images.ts` | classification, page image recovery |
| `src/lib/vyron-invoice-table-vision.ts` | locate, crop, column-identity read |
| `src/lib/vyron-extraction-evidence.ts` | evidence capture, monitoring record |
| `src/app/api/developer/extraction-diagnostics/route.ts` | developer diagnostics |
| `scripts/run-extraction-regression.mjs` | regression runner |
| `scripts/diagnose-invoice-line-mapping.mjs` | per-document stage comparison |

Unchanged by this work: approval workflow, purchase orders, entitlement,
supplier approval, review UI, accounting workflow, database schema.
