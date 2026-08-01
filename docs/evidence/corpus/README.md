# Supplier invoice regression corpus

The permanent evidence base for the extraction engine. Every change to the
engine, the prompts, the retry strategy or the vision pipeline is measured
against this corpus before it ships.

## The rule that matters

**Ground truth comes from a real invoice, read by a human, and nothing else.**

An answer key that was produced by the extractor measures the extractor against
itself and will certify its own mistakes. If a value cannot be read off the
document, it is recorded as `null` and excluded from scoring — never guessed,
never inferred from the arithmetic, never copied from a previous run.

A key is only accepted once it reconciles against the invoice's own printed
totals. That check is what makes it trustworthy: it is independent of whatever
the model returned.

## Layout

```
docs/evidence/corpus/
  README.md              this file
  <supplier>/
    <invoice>.json       the answer key
    <invoice>.pdf        the source document (git-ignored — see below)
```

Source PDFs are **not committed**. They are real supplier documents containing
customer names, account numbers and pricing. Keep them in the storage bucket or
a local directory and point the runner at it.

## Answer key format

```jsonc
{
  "supplier": "Gourmet Foods on the Go",
  "invoiceNumber": "02252489",
  "documentId": "f9967375-3eec-41ac-86f4-1eccc2568339",
  "sourceFile": "doc00190220260721125543.pdf",
  "characteristics": ["scanned", "single-page", "mixed-vat", "weight-column"],
  "groundTruthSource": "Read from the 200 DPI scan by a human reviewer.",
  "verification": "Line totals sum to 26766.19 against a printed total of 26766.18; VAT column sums to 3458.38 against a printed VAT of 3458.37.",
  "header": { "subtotal": 23307.81, "vat": 3458.37, "total": 26766.18 },
  "printedColumns": ["CODE", "PRODUCT DESCRIPTION", "QUANTITY", "UNIT", "UNIT PRICE", "WEIGHT", "V.A.T.", "NETT PRICE"],
  "lineTotalBasis": "inclusive",
  "lineItems": [
    { "description": "...", "quantity": 12, "unitPrice": 70.59, "vatAmount": 127.06, "lineTotal": 974.14 }
  ]
}
```

`lineTotalBasis` records whether the final money column includes VAT. Gourmet
Foods prints a VAT-inclusive `NETT PRICE`; other suppliers print an exclusive
`Amount`. The engine reconciles against either, and the corpus has to say which
so a passing extraction is not mistaken for a failing one.

## Coverage

| Supplier / class | Status | Characteristics |
|---|---|---|
| Gourmet Foods 02252489 | **key verified** | scanned, single page, mixed VAT, weight column, inclusive line totals |
| Gourmet Foods 02257588 | source identified, key outstanding | scanned, under-extracted in production |
| Kingdom Foods | **awaiting documents** | — |
| N1 Restaurant Suppliers | source identified, key outstanding | 6-line and 2-line invoices in storage |
| Supplier statements | source identified, key outstanding | no line items expected |
| Multi-page invoices | **awaiting documents** | — |
| Zero VAT | partially covered | Gourmet Foods row 9 is zero-rated |
| Pack pricing | partially covered | Gourmet Foods CASE and 25kg rows |
| Weight-based pricing | **covered** | Gourmet Foods WEIGHT column |

Rows marked *awaiting documents* have no answer key and are **not** counted as
passing. They are listed so the gap is visible rather than silently absent.

## Running it

```
node scripts/run-extraction-regression.mjs --documents ./corpus-pdfs
node scripts/run-extraction-regression.mjs --documents ./corpus-pdfs --supplier gourmet-foods
```

Calls OpenAI for every document, so it is billable and requires
`VYRON_ACKNOWLEDGE_EXTERNAL=1` under the Repository Safety Programme.

## Adding a supplier

1. Obtain the real invoice.
2. Read the table by eye and record every row.
3. Check the key reconciles against the printed totals. If it does not, the key
   is wrong — not the invoice.
4. Save it under `docs/evidence/corpus/<supplier>/<invoice>.json`.
5. Run the regression and record the baseline.
