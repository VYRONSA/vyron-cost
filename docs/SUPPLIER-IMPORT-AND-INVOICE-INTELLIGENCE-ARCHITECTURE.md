# VYRON COST — Supplier Import & Invoice Intelligence Architecture

**Programme:** Product Gap Resolution, Phase 1
**Status:** Discovery, gap analysis and roadmap. **Nothing in this document is implemented.**
**Deliverable scope:** Phases A, B and C of the directive. No code was written or modified.

| Label | Meaning |
|---|---|
| **[VERIFIED]** | Established by direct inspection of a named file, with line numbers |
| **[INFERRED]** | Reasoned from verified facts; the reasoning is shown so it can be challenged |
| **[UNKNOWN]** | Not established by repository evidence. Stated as a question, never resolved by assumption |

**Sources:** `docs/PRODUCT-GAP-REGISTER.md` (read from branch `docs/product-gap-register` without
checkout — it is not in this working tree), the application source, and the SQL under `supabase/`
and `src/supabase/`.

---

# PART 1 — Executive Summary

## 1.1 The headline correction

The Product Gap Register records **GAP-002 — No dedicated Supplier Import module**, citing
`src/lib/vyron-import-centre-v1.ts:8`. That citation is exactly right, and the conclusion drawn from
it is incomplete in a way that changes the programme.

**[VERIFIED] A supplier import path exists, is reachable, is permission-guarded, and is unsafe.**

`src/lib/vyron-import-persist.ts:31-53` implements `persistImportRows(entity: "suppliers")`, exposed
via `POST /api/workspace/admin/import` and driven by the `/admin/imports` UI. It works. It writes to
`vyron_cost_suppliers`. And it performs **no duplicate check of any kind**:

```ts
// src/lib/vyron-import-persist.ts:40-48 — no existence query precedes this
const { error } = await supabase.from("vyron_cost_suppliers").insert({
  id: randomUUID(),
  company_id: companyId,
  supplier_name: name,
  ...
});
```

Re-importing the same file creates a second copy of every supplier. **This is worse than a missing
capability:** an absent feature is safe, whereas a reachable import that silently duplicates master
data corrupts it. The programme's first job is therefore not to *build* supplier import — it is to
**consolidate three divergent import paths into one safe one.**

## 1.2 What actually exists

**[VERIFIED] Three import pipelines, four import UIs, three different supplier column sets.**

| Pipeline | Entry point | Modules | Duplicate handling | State |
|---|---|---|---|---|
| **Import Centre v1** | `/import-centre` → `/api/import-centre/*` | 3 — raw-materials, finished-goods, boms | Skip on exact name match | Working |
| **Admin Import** | `/admin/imports` → `/api/workspace/admin/import` | 16 entity types **incl. suppliers** | **None** | Working, unsafe |
| **Bulk Import Centre** | `/bulk-import-centre` | 6 advertised | N/A | **Stub — GAP-001** |

`/imports` (`ImportsCentreClient.tsx`) is a fourth UI over the same 16-entity template registry.

**[VERIFIED] Invoice Intelligence is substantially built and materially better than the import side.**
Real structured LLM extraction against a strict JSON schema, per-field *and* per-line confidence
scoring, deterministic arithmetic validation, a supplier line-learning system that improves item
matching over time, price-history capture on approval, and an approval-rules engine. This is not a
prototype.

## 1.3 The three defects that matter most

**[VERIFIED] 1 — Duplicate invoice detection does not exist.** The UI reads
`risk_type = 'duplicate_invoice'` rows (`src/lib/vyron-document-intelligence-data.ts:130`). Searching
the entire repository, **those rows are written only by demo seed SQL**
(`supabase/vyron-cost-demo-full-business-cycle.sql:565-566`, marked `is_demo = true`,
`demo_seed_key = 'vyron_cost_meeting_2026'`). No application code writes them. The only live signal
is `validation.duplicateRisk`, which is **supplied by the language model**
(`src/lib/document-intelligence-v2/types.ts:231`) — and the model sees one PDF with no access to the
tenant's existing invoices, so it cannot know. **Duplicate-invoice protection is demo fiction.**

**[VERIFIED] 2 — Customer data is written to the supplier table.**
`src/components/admin/ClientImportCentreClient.tsx:43-53` takes the **suppliers** template, relabels
it `"Customers"`, and keeps `id: "suppliers"`. A user importing customers through `/admin/imports`
writes rows into `vyron_cost_suppliers`.

**[VERIFIED] 3 — The CSV parser cannot read a realistic CSV.**
`src/lib/vyron-import-centre.ts:185` — `line.split(",")`. No quoted-field handling, so an embedded
comma (`"Acme Foods, Ltd"`) shifts every subsequent column. No UTF-8 BOM strip, so the first header
name is corrupted on any Excel-exported file. No formula-injection neutralisation. Blank lines are
dropped silently rather than reported.

**A correct CSV parser already exists in this repository** — `.tmp-fg-cert/certify-fg-export.mjs:53-80`
handles quoted fields, escaped quotes and BOM stripping. It is in a test script. The production
import path does not use it.

## 1.4 The strategic conclusion

**[INFERRED]** Supplier Import and Invoice Intelligence are not two initiatives. They are two writers
to the same master-data spine, and today **each has its own supplier-resolution logic**:

| Writer | Supplier resolution | Evidence |
|---|---|---|
| Raw-materials import | Contact Master, `ilike` exact | `vyron-import-centre-v1.ts:185-225` |
| Admin supplier import | **None** — blind insert | `vyron-import-persist.ts:40` |
| Invoice review | `ilike` exact | `documents/[id]/review/create-entity/route.ts:61-64` |

Three writers, three behaviours, no shared service, and no fuzzy matching anywhere. **The single
highest-value engineering act in this programme is to create one canonical supplier resolution
service and route all three through it.** Everything else — templates, UI consolidation, rollback,
duplicate detection — is downstream of that decision.

---

# PART 2 — Existing Capability

## 2.1 Supplier Import

### 2.1.1 Import Centre v1 — the functional pipeline

**[VERIFIED]** `src/lib/vyron-import-centre-v1.ts` (676 lines).

```ts
// line 8
export type ImportCentreModule = "raw-materials" | "finished-goods" | "boms";
```

| Capability | State | Evidence |
|---|---|---|
| Template definition + CSV download | **Working** | `importCentreTemplates` lines 18-73; `/api/import-centre/template` |
| Parse | **Working, defective** | Delegates to `parseCsvText` — see §2.1.4 |
| Per-row validation with row numbers | **Working** | `validateImportCentreRows` lines 271-339; `rowNumber: index + 2` |
| Cross-entity validation (BOMs) | **Working** | Missing ingredients / finished goods reported, lines 311-338 |
| Preview before commit | **Working** | First 25 valid rows, line 305 |
| Duplicate handling | **Skip only** | `if (existingNames.has(...)) { skipped += 1; continue; }` lines 369, 451, 573 |
| Update existing records | **Absent** | No `update` or `upsert` call in the file |
| Auto-create categories | **Working** | `ensureCategory` lines 142-175 |
| Auto-create suppliers | **Working** | `resolveSupplierIdViaContactMaster` lines 177-225 |
| Auto-create missing materials (BOMs) | **Working, opt-in** | `createMissingIngredient` lines 506-536 |
| Per-row error reporting | **Working** | `errors: string[]` accumulated with the entity name |
| Rollback | **Absent** | Row-by-row inserts in a `for` loop; no transaction |
| Import audit trail | **Working** | `/api/import-centre/import/route.ts:86` writes `vyron_import_runs` |

**[VERIFIED] Numeric validation is driven by column *name*, not by declared type:**

```ts
// vyron-import-centre-v1.ts:287
if (/price|cost|qty|percent|movement|gp/i.test(col) && row[col] && Number.isNaN(Number(row[col])))
```

**[INFERRED]** A future `payment_terms` or `credit_limit` column would receive no numeric validation
because its name does not match the regex. Type validation is a property of the template, and the
template does not carry types.

### 2.1.2 Admin Import — the second pipeline

**[VERIFIED]** `src/lib/vyron-import-persist.ts` supports 16 entity types including `suppliers`,
`customers`, `purchase-orders`, `supplier-invoices` and `invoice-lines`
(`src/lib/vyron-import-centre.ts:1-17`).

The route is properly guarded — `requireAdminSession("admin.imports")` and `requireApiCompanyId()`
(`src/app/api/workspace/admin/import/route.ts:12-13`) — and writes an audit row to
`vyron_import_runs` (lines 32-40). **Security and multi-tenancy are correct.** The defect is
exclusively in the persistence logic: no duplicate detection, no update path, no rollback.

**[VERIFIED]** The audit write is fire-and-forget:
`.then(() => undefined, () => undefined)` (line 40). A failure to record an import is swallowed.

### 2.1.3 Bulk Import Centre — the stub

**[VERIFIED]** GAP-001 confirmed verbatim. `src/components/BulkImportCentreClient.tsx:74-77`:

```tsx
onChange={(event) => {
  const file = event.target.files?.[0];
  if (file) setUploaded((current) => ({ ...current, [name]: file.name }));
}}
```

The filename is stored in state and rendered as `Staged: {filename}`. There is no `fetch`, no parse,
no persistence. Template download (lines 16-24) does work.

### 2.1.4 The CSV parser

**[VERIFIED]** `src/lib/vyron-import-centre.ts:163-202`. Used by **every** import path.

| Behaviour | Line | Consequence |
|---|---|---|
| `line.split(",")` | 185 | Quoted fields containing commas corrupt all subsequent columns |
| No `﻿` strip | 164 | Excel-exported UTF-8 files fail header matching on column 1 |
| `.trim()` on every cell | 185 | Intentional leading/trailing whitespace is lost |
| `.filter(Boolean)` on lines | 167 | Blank rows silently dropped, never reported |
| `header.includes(col)` | 173 | Case-sensitive, exact header match only |
| No formula-injection handling | — | `=cmd\|…` passes through to storage and to any export |
| No row-count ceiling | — | No volume guard; see §6.4 |

**[VERIFIED]** A correct parser exists at `.tmp-fg-cert/certify-fg-export.mjs:53-80`, handling
quoted fields, `""` escaping and BOM stripping.

### 2.1.5 Import history

**[VERIFIED]** `vyron_import_runs` exists (`src/supabase/migrations/20260613_go_live_foundation.sql:3`)
and is written by both functional routes. Both import UIs nevertheless display
`defaultImportHistory()` — **hardcoded fixture rows** (`vyron-import-centre.ts:204-225`) naming
`handcrafted-ingredients.csv` with 186 rows:

- `src/components/ImportsCentreClient.tsx:26`
- `src/components/admin/ClientImportCentreClient.tsx:36`

**[INFERRED]** This is the same class of defect as GAP-001: the interface presents information that
looks like a record of the user's own activity and is not.

### 2.1.6 Template divergence

**[VERIFIED]** Three registries define the supplier import contract differently:

| Source | Supplier columns |
|---|---|
| `vyron-import-centre.ts:84` | `supplier_name, category, contact_email, risk_status, last_price_movement` |
| `BulkImportCentreClient.tsx:8` | `supplier_name, category, contact_email, invoice_email, payment_terms` |
| `vyron-import-centre-v1.ts` | *(no supplier module)* |

A template downloaded from `/bulk-import-centre` cannot be imported by any working endpoint, because
no consumer expects `invoice_email` or `payment_terms`.

## 2.2 Supplier Invoice Intelligence

### 2.2.1 Extraction

**[VERIFIED]** `src/lib/document-intelligence-v2/supplier-invoice-extractor.ts`.

| Capability | State | Evidence |
|---|---|---|
| Structured extraction | **Working** | `responses.create` with `json_schema`, `strict: true`, line 77-84 |
| Determinism | **Working** | `temperature: 0`, line 76; `store: false` |
| Model + fallback | **Working** | `OPENAI_DOCUMENT_MODEL \|\| "gpt-4o"` line 55; fallback `gpt-4o-mini` at `vyron-document-extraction.ts:653` |
| Schema validation | **Working** | `validateSupplierInvoiceExtractionJson`, line 93 |
| Normalisation | **Working** | `normalizeSupplierInvoiceExtraction`, line 94, with `normalizationChanged` flag |
| Debug trace | **Working** | Raw / validated / normalised JSON retained, lines 98-106 |

**[VERIFIED] There is no separate OCR stage.** The PDF is sent to the multimodal model as a base64
data URL (`file_data: dataUrl`, line 70). OCR is delegated to the vision model. No Tesseract, no
Textract, no preprocessing.

**[INFERRED]** This is a sound choice for clean digital PDFs and an untested one for scanned or
skewed documents. Nothing in the repository measures accuracy against a labelled corpus, so
degradation on poor scans is **[UNKNOWN]**.

### 2.2.2 Confidence and validation

**[VERIFIED]** Genuinely implemented, at two levels.

- **Header fields** — confidence per field for supplier, invoice number, date, VAT numbers, account
  number, order number, subtotal, VAT, total (`vyron-document-extraction.ts:329-341`).
- **Line items** — confidence per line *and* per field within the line: description, quantity, unit,
  unitPrice, vatAmount, lineTotal, skuOrProductCode (lines 298-306).
- **Persisted** — `confidence`, `field_confidence` (lines 811-812) and per-line `confidence_score`,
  `field_confidence` (lines 864-865).

**[VERIFIED] Deterministic post-hoc penalties**, applied by code rather than by the model
(lines 258-270):

```ts
confidence = confidence
  - missingFields.length * 10
  - (subtotalVatTotalCheck === "Fail" ? 15 : 0)
  - (lineItemsTotalCheck === "Fail" ? 10 : 0)
```

**[INFERRED]** This is a good design: the model's self-reported confidence is untrustworthy on its
own, and the arithmetic checks are objective. Anchoring the score to verifiable facts is exactly
right.

### 2.2.3 Item matching and learning

**[VERIFIED]** `src/lib/vyron-supplier-line-learning.ts` (18.4KB) is a real learning system.

The mapping table carries `supplier_name`, `supplier_vat_number`, `source_description`,
`source_description_normalized`, `source_sku`, `source_sku_normalized`, `unit`, `entity_type`,
`entity_id`, `entity_name`, `last_approved_price`, `confidence_score`, `approved_by`, `approved_at`,
`usage_count`, `last_seen_at`, `disabled`, `match_source` (line 168).

Mappings are written when a reviewer approves a line with a matched entity (lines 278-346), scoped by
tenant and supplier, with re-mapping detected when the entity changes (lines 293-294).

**[INFERRED]** This is the strongest asset in the whole workflow and the foundation on which
Purchase History Intelligence and Cost Intelligence should be built.

### 2.2.4 Price history

**[VERIFIED]** Wired and real. `src/app/api/documents/[id]/review/approve/route.ts:17` imports
`buildPriceHistoryRecord`, `changePercent` and `insertPriceHistoryRows`, writing
`vyron_supplier_price_history` on approval (`src/lib/vyron-price-history.ts:128-133`). Queryable per
document (line 187) and per tenant with filters (line 135).

### 2.2.5 Review and approval

**[VERIFIED]** A substantial surface: 22 document routes including `review`, `review/approve`,
`review/corrections`, `review/create-entity`, `review/validate`, `link-po`, `cost-audit`,
`rollback-cost`, `audit-trail`, and six bulk operations. Supporting libraries include
`vyron-document-approval-rules.ts`, `vyron-document-approval-validation.ts` (with rules such as
`require_invoice_number`), `vyron-document-cost-rollback.ts` and `vyron-document-audit-trail.ts`.

**[VERIFIED]** Cost rollback exists — `rollback-cost` route plus `vyron-document-cost-rollback.ts`.
**[INFERRED]** This is the closest thing in the product to transactional reversal, and it is a model
worth reusing for import rollback (§6.2).

### 2.2.6 Upload and storage

**[VERIFIED]** `src/app/api/documents/upload/route.ts` (312 lines). MIME allowlist enforced
(`isAllowedDocumentMime` — PDF, PNG, JPG, JPEG, WEBP). Storage to the `vyron-documents` bucket with
a tenant-scoped path, status transitions (`uploaded`, `upload_failed`), event logging, and a
post-upload size-comparison trace.

**[VERIFIED] There is no maximum file size.** The route measures sizes for diagnostics
(lines 94, 207, 223, 291, 306) but never rejects on size.

---

# PART 3 — Current Workflow

## 3.1 Supplier Import — the user journey today

```
Route A — /import-centre                 [WORKS, no supplier module]
  select module (3 only) → download template → upload → parse → validate
  → preview 25 rows → import → skip duplicates → audit row written

Route B — /admin/imports                 [WORKS for suppliers, UNSAFE]
  select entity (16, incl. "Customers" which is really suppliers)
  → upload → parse → validate → import → BLIND INSERT → audit row written
  → history panel shows FAKE fixture data

Route C — /bulk-import-centre            [STUB]
  download template → upload → "Staged: file.csv" → nothing happens

Route D — /imports                       [parse + validate only]
  Fourth UI over the same 16-entity registry
```

**[INFERRED]** A user seeking to import suppliers will most plausibly try `/bulk-import-centre` —
it is the one whose name matches the task and whose Suppliers template appears first. That is the
route that does nothing. The route that works is labelled "Customers".

## 3.2 Invoice Intelligence — the user journey today

```
upload (MIME-checked, no size limit) → storage + vyron_documents row
  → extract (gpt-4o, strict JSON schema, temperature 0)
    → schema validate → normalise
    → arithmetic checks (subtotal+VAT vs total; lines vs subtotal)
    → confidence penalties applied deterministically
  → review workspace
    → supplier match (ilike exact)  ── no match → create-entity
    → line match via supplier learning mappings
    → corrections → validate against approval rules
  → approve
    → price history written
    → learning mappings upserted
    → cost audit + audit trail
    → [cost rollback available]
```

**[INFERRED]** This is a coherent, well-staged pipeline. Its weaknesses are at the two ends —
what is *accepted* (no size limit, no duplicate check) and what is *proven* (no accuracy measurement).

---

# PART 4 — Gap Analysis

## 4.1 Completed functionality

| Capability | Evidence |
|---|---|
| Structured AI extraction with strict schema and deterministic settings | `supplier-invoice-extractor.ts:60-85` |
| Two-level confidence scoring, persisted | `vyron-document-extraction.ts:298-341, 811-865` |
| Objective arithmetic validation with confidence penalties | `vyron-document-extraction.ts:254-270` |
| Supplier line learning with usage counts and price memory | `vyron-supplier-line-learning.ts` |
| Price history on approval | `review/approve/route.ts:17`; `vyron-price-history.ts:128` |
| Approval rules engine | `vyron-document-approval-rules.ts`, `-validation.ts` |
| Cost audit and cost rollback | `vyron-document-cost-rollback.ts`; `rollback-cost` route |
| AI usage metering with allowance enforcement | `document-intelligence/extract/route.ts:66-79` |
| Import audit table | `vyron_import_runs`, migration `20260613` |
| Import permission + tenant guards | `workspace/admin/import/route.ts:12-13` |
| Cross-entity import validation (BOMs) | `vyron-import-centre-v1.ts:311-338` |

## 4.2 Partial functionality

| Capability | What works | What does not |
|---|---|---|
| **Supplier import** | Insert path, permissions, audit row | No duplicate detection, no update, no rollback, undiscoverable |
| **Duplicate handling (import)** | Skip on exact normalised name (v1 only) | No fuzzy matching; no update-existing; absent entirely in admin path |
| **Import history** | Written to `vyron_import_runs` | Not displayed — UIs show hardcoded fixtures |
| **Import error reporting** | Per-row errors with row numbers | Not exportable; capped at 50 in the audit row |
| **Supplier matching** | `ilike` exact match | No fuzzy/near-duplicate detection anywhere |
| **Extraction robustness** | Clean digital PDFs | Scanned/skewed/low-DPI behaviour unmeasured |
| **Storage lifecycle** | Upload, path, status | No size limit; orphaned-object reconciliation absent |

## 4.3 Missing functionality

| # | Gap | Severity | Evidence |
|---|---|---|---|
| M1 | **Duplicate invoice detection** | **Critical** | Only demo seed writes `duplicate_invoice`; `duplicateRisk` is model-supplied |
| M2 | **Duplicate supplier prevention in the admin path** | **Critical** | `vyron-import-persist.ts:40` blind insert |
| M3 | **Quoted-CSV / BOM / encoding handling** | **High** | `vyron-import-centre.ts:185` |
| M4 | **Update-existing on import** | **High** | No `update`/`upsert` in either pipeline |
| M5 | **Rollback on mid-import failure** | **High** | Row-by-row loops, no transaction |
| M6 | **Supplier import in the primary pipeline** | **High** | GAP-002; `vyron-import-centre-v1.ts:8` |
| M7 | **Bulk Import Centre wiring** | **High** | GAP-001 |
| M8 | **Formula-injection neutralisation** | **Medium** | No escaping on import or export |
| M9 | **Upload size limit** | **Medium** | No threshold in `documents/upload/route.ts` |
| M10 | **Extraction accuracy measurement** | **Medium** | No labelled corpus, no accuracy metric |
| M11 | **Excel (.xlsx) parsing** | **Medium** | Inputs accept `.xlsx`; only CSV is parsed |
| M12 | **Per-row import outcome export** | **Low** | Errors shown in UI only |

**[VERIFIED] M11 detail:** `BulkImportCentreClient.tsx:72` accepts `.csv,.xlsx`. `xlsx` is a
declared dependency and used by `scripts/import-handcrafted.mjs`, but no import route parses a
workbook. An uploaded `.xlsx` reaching `parseCsvText` would be read as binary text and fail header
matching.

## 4.4 Technical debt

| # | Debt | Evidence |
|---|---|---|
| D1 | **Three import pipelines, four UIs** | §2.1 |
| D2 | **Three divergent supplier column sets** | §2.1.6 |
| D3 | **Two parallel template registries** | `vyron-import-centre.ts:37` vs `-v1.ts:18` |
| D4 | **Three independent supplier-resolution implementations** | §1.4 |
| D5 | **Customers template mapped to the suppliers entity** | `ClientImportCentreClient.tsx:43-53` |
| D6 | **Fabricated import history in the UI** | `vyron-import-centre.ts:204` |
| D7 | **Name-regex numeric validation** | `vyron-import-centre-v1.ts:287` |
| D8 | **Fire-and-forget audit write** | `workspace/admin/import/route.ts:40` |
| D9 | **Stale backlog comment** | `-v1.ts:19` says opening-stock import is "not yet implemented"; `vyron-opening-stock-import.ts` and its route exist |
| D10 | **Correct CSV parser exists only in a test script** | `.tmp-fg-cert/certify-fg-export.mjs:53-80` |

## 4.5 UX issues

| # | Issue | Impact |
|---|---|---|
| U1 | The route named for the task does nothing (GAP-001) | User believes data was staged |
| U2 | Import history is fabricated | User believes prior imports succeeded |
| U3 | "Customers" writes suppliers | Silent cross-contamination of master data |
| U4 | Four import entry points, no canonical one | User cannot tell which is authoritative |
| U5 | Downloaded template does not match any importer | Prepared file is rejected or misparsed |
| U6 | Duplicates are skipped silently, not reported as "already exists" | User cannot distinguish "unchanged" from "not imported" |
| U7 | No dry-run/impact summary before commit for the admin path | No "will create 12, update 3, skip 2" |

## 4.6 Performance considerations

**[INFERRED, not measured — no timing instrumentation exists in either pipeline.]**

- **P1 — Per-row sequential round trips.** `importRawMaterials` performs, per row, a category check,
  a supplier resolution (up to 4 queries — `vyron-import-centre-v1.ts:185-224`) and an insert. For
  the reference tenant's 326 suppliers this is well over a thousand sequential round trips.
- **P2 — Full-table preload.** `loadIngredientNameSet`, `loadProductNameMap` and
  `loadIngredientNameMap` select every row for the company with no pagination. Supabase applies a
  default row cap; **[UNKNOWN]** whether it is reached at the reference tenant's volumes, and a
  silent truncation would cause **false "not found" errors and duplicate creation.**
- **P3 — Map reload inside a loop.** `importBoms` re-runs `loadIngredientNameMap` after each created
  material (`-v1.ts:609`) — O(n) full reloads.
- **P4 — Whole file in memory.** Parse and validate load the entire file as a string.
- **P5 — Extraction latency.** `maxDuration = 120` on the extract route. A large multi-page scan may
  approach it. Bulk extract exists (`documents/bulk-extract`) but concurrency behaviour is
  **[UNKNOWN]**.

---

# PART 5 — Integration Architecture

## 5.1 The core principle

> **Supplier Import and Invoice Intelligence must never create master data directly.**
> Both must request it from a single resolution service that owns identity, matching and merging.

**[INFERRED]** This follows directly from §1.4: three writers with three different matchers cannot
converge on one supplier identity, and adding a fourth writer would compound it. The service is the
architecture; everything else is a client of it.

## 5.2 Avoiding duplicate suppliers

**Proposed — `resolveSupplier()`, the single entry point. [TO BUILD]**

Resolution ladder, strongest signal first:

| Tier | Signal | Action |
|---|---|---|
| 1 | Supplier VAT number exact | Match. Highest confidence — already extracted (`supplierVatNo`) but unused for matching |
| 2 | Normalised name exact | Match (current `ilike` behaviour, made canonical) |
| 3 | Normalised name after removing legal suffixes (`Pty Ltd`, `CC`, `(Pty)`, `&`/`and`) | Match with confidence |
| 4 | Fuzzy similarity above threshold | **Propose, never auto-merge** — surface for confirmation |
| 5 | No match | Create, recording provenance (`import` / `invoice` / `manual`) |

**[INFERRED]** Tier 4 must not auto-merge. A wrong merge of two real suppliers is materially harder
to undo than a duplicate, because downstream invoices, POs and price history will already have been
attached to the merged identity.

**Prerequisite:** every writer routes through this service — `vyron-import-persist.ts:31`,
`vyron-import-centre-v1.ts:177`, and `review/create-entity/route.ts`.

## 5.3 Avoiding duplicate products and ingredients

**[VERIFIED]** The mechanism largely exists: `vyron-supplier-line-learning.ts` already maps a
supplier's line description and SKU to an internal entity, with confidence and usage counts.

**Proposed extension [TO BUILD]:** make the import path a *reader* of the same mappings. When a
supplier import or a raw-materials import encounters an item description a supplier has previously
invoiced, the learned mapping should be offered rather than a new ingredient created. Today the
learning table is written only by invoice approval and read only by extraction.

## 5.4 Avoiding duplicate invoices

**[TO BUILD] — this does not exist in any form (§1.3).**

Proposed deterministic check at upload and again at approval:

| Tier | Rule | Outcome |
|---|---|---|
| 1 | `(supplier_id, invoice_number)` already present for the tenant | **Block** — hard duplicate |
| 2 | Identical file hash already uploaded | **Block** — same document re-uploaded |
| 3 | Same supplier, same total, invoice date within N days | **Warn** — probable duplicate, requires reviewer confirmation |
| 4 | Same supplier, same total, different number | **Flag** — record a real `duplicate_invoice` risk row |

**[INFERRED]** Tiers 1 and 2 are cheap, deterministic and catch the common real-world cases
(re-emailed invoice, double upload). They should not wait for the later phases. The existing
`vyron_procurement_risk_alerts` table and the UI that reads it already exist — **the missing piece is
the writer**, not the schema or the display.

**Explicit correction to make:** `validation.duplicateRisk` should be removed from the model's
schema, or renamed to make clear it is a model impression rather than a verified finding. A field
that looks authoritative and cannot be is worse than no field.

## 5.5 How the two workflows meet

```
                    ┌──────────────────────────────┐
   Supplier ───────►│                              │
   Import           │   SUPPLIER RESOLUTION        │◄─────── Invoice
                    │   VAT → name → fuzzy → new   │         Review
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │   SUPPLIER MASTER            │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
   Import ─────────►│   ITEM RESOLUTION            │◄─────── Invoice
   (materials)      │   learned mappings + SKU     │         lines
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │   PURCHASE HISTORY           │
                    │   price movement, variance   │
                    └──────────────────────────────┘
```

**[INFERRED]** Import establishes the master data; invoices enrich it with observed prices; purchase
history turns the two into intelligence. The direction of value runs one way, which is why import
must be fixed first — an invoice pipeline feeding a duplicated supplier master produces
sophisticated analysis of incoherent data.

---

# PART 6 — Product Gap Alignment

## 6.1 Register entries

| ID | Register statement | Audit finding |
|---|---|---|
| **GAP-001** | Bulk Import Centre is a UI stub | **Confirmed verbatim.** `BulkImportCentreClient.tsx:74-77` |
| **GAP-002** | No dedicated Supplier Import module | **Confirmed for the v1 pipeline; incomplete overall.** A supplier import exists in a second pipeline (`vyron-import-persist.ts:31-53`) with no duplicate detection. **Recommend amending the entry** — the gap is not only absence, it is an unsafe reachable path |
| **GAP-003** | `extract` returns 500 for invalid multipart | **Confirmed.** `document-intelligence/extract/route.ts:131-138` catch-all returns 500 for the content-type error raised by `request.formData()` |

**[INFERRED]** The register's own scope rule — *"records gaps that have been observed and verified"* —
is well served by amending GAP-002 rather than opening a new entry, since the initiative is the same.

## 6.2 Recommended new register entries

Each meets the register's evidentiary standard: current behaviour reproduced, technical location
identified.

| Proposed | Gap | Priority | Evidence |
|---|---|---|---|
| **GAP-004** | Admin supplier import creates duplicates on every re-run | **High** | `vyron-import-persist.ts:40-48` |
| **GAP-005** | "Customers" import template writes to `vyron_cost_suppliers` | **High** | `ClientImportCentreClient.tsx:43-53` |
| **GAP-006** | Duplicate invoice detection is demo-seed only | **High** | `vyron-cost-demo-full-business-cycle.sql:565`; no application writer |
| **GAP-007** | CSV parser cannot handle quoted fields or UTF-8 BOM | **High** | `vyron-import-centre.ts:185` |
| **GAP-008** | Import history panels display hardcoded fixtures | **Medium** | `vyron-import-centre.ts:204`; `ImportsCentreClient.tsx:26` |
| **GAP-009** | No maximum upload size on document upload | **Medium** | `documents/upload/route.ts` |
| **GAP-010** | `/api/document-intelligence/extract` is unauthenticated; AI allowance is skipped when company context cannot resolve | **Medium** | `document-intelligence/extract/route.ts:13-17, 64-79` |

**[VERIFIED] GAP-010 nuance:** the route carries an explicit comment stating the absence of auth is
deliberate — *"rather than newly requiring auth on a route that has never required it"*. The
consequence worth recording is narrower than "unauthenticated endpoint": when
`resolveBestEffortAiContext()` returns `null`, `aiContext` is falsy and **the allowance check is
skipped entirely** (line 66), so extraction proceeds unmetered.

---

# PART 7 — Engineering Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Consolidating three pipelines breaks a working path.** `/import-centre` and `/admin/imports` both work today | **High** | Add the supplier module to v1 first; leave the admin path intact until the replacement is proven; retire last |
| R2 | **Fuzzy matching auto-merges two real suppliers.** Harder to undo than a duplicate — downstream invoices, POs and price history follow the merged identity | **High** | Never auto-merge above tier 3. Propose-and-confirm only |
| R3 | **Fixing the CSV parser changes existing behaviour.** Files that parse today may parse *differently* once quoting is honoured | **Medium** | Version the parser; run both over a fixture corpus and diff before switching |
| R4 | **Duplicate-invoice blocking rejects legitimate invoices.** Some suppliers reuse numbers across years | **Medium** | Scope tier 1 by supplier *and* financial period; make tier 3 a warning, never a block |
| R5 | **Full-table preloads silently truncate at volume** (§4.6 P2), causing false "not found" and duplicate creation | **Medium** | Paginate explicitly; assert the loaded count matches the table count |
| R6 | **Import rollback is genuinely hard.** PostgREST has no multi-statement transaction; the pipeline creates categories, suppliers and materials as side effects | **High** | Model on the existing `vyron-document-cost-rollback.ts` — record an import run id on every created row and implement compensating delete, rather than attempting true transactionality |
| R7 | **Learning mappings poisoned by a wrong approval.** An incorrect entity match is remembered and reused | **Medium** | `disabled` and `match_source` columns already exist; add reviewer-visible correction of a learned mapping |
| R8 | **Removing `duplicateRisk` from the schema is a breaking change** to the strict JSON schema and any stored extraction | **Low** | Retain the field; relabel in UI as "model impression"; add the verified check alongside |

**[INFERRED] R6 is the risk most likely to be underestimated.** PAT-IMPORT-007 ("rollback on
mid-import failure leaves no partial state") cannot be satisfied by wrapping the loop in a
transaction, because the pipeline's writes span multiple tables via multiple round trips. The
achievable goal is *compensating* rollback with a run id, not atomicity.

---

# PART 8 — UX Recommendations

**One import destination.** Retire three of the four entry points. `/import-centre` is the strongest
candidate — it already has the parse → validate → preview → import flow and the cross-entity
validation. **[INFERRED]** GAP-001 should be closed by **redirecting** `/bulk-import-centre` to the
real Import Centre, not by re-implementing it there; the register itself warns that scoping GAP-001
and GAP-002 separately "risks building the same capability twice."

**Report outcomes per row, in four categories, not two.** Today a row is imported or skipped.
Suppliers need: **Created · Updated · Skipped (identical) · Rejected (with reason)**. U6 exists
because "skipped" currently conflates "already correct" with "not imported".

**Show the impact before committing.** "This file will create 12 suppliers, update 3, skip 2 and
reject 1" — derivable from the existing validate step, which already computes valid/invalid rows and
has database access.

**Surface near-duplicates as a decision, not a failure.** *"Acme Foods (Pty) Ltd — 92% similar to
existing Acme Foods Ltd. Merge / Create new / Skip."*

**Replace fabricated history with the real table.** `vyron_import_runs` is already populated. This is
a read, not a feature.

**Fix the "Customers" label immediately.** It is a one-line correction to a live data-integrity
defect and should not wait for a phase.

**Make confidence actionable in review.** Per-field confidence is already captured and persisted;
the review workspace should sort and filter by it so the reviewer's attention goes to the least
certain fields first.

---

# PART 9 — Phased Roadmap

Sequenced so that master-data integrity precedes intelligence built on it. **No implementation is
authorised by this document.**

### Phase 0 — Integrity corrections *(precedes Phase 1)*

Small, isolated, high-value fixes that need no architecture.

- Fix the "Customers"→suppliers mapping (GAP-005).
- Add a duplicate check to `persistImportRows("suppliers")` (GAP-004) — even exact-name-skip removes
  the corruption path.
- Replace `defaultImportHistory()` with a read of `vyron_import_runs` (GAP-008).
- Add an upload size limit (GAP-009).
- Return 415/400 from the extract route (GAP-003).

**Exit:** no reachable path corrupts master data.

### Phase 1 — Supplier Import foundation

- **Canonical CSV/Excel parser** — quoted fields, BOM, line endings, encoding, formula-injection
  neutralisation, `.xlsx` via the existing `xlsx` dependency. Promote the parser already proven in
  `.tmp-fg-cert/certify-fg-export.mjs`.
- **`suppliers` module in Import Centre v1** — closes GAP-002 in the primary pipeline.
- **Create *and* update** semantics with four-category per-row outcomes.
- **Compensating rollback** via an import run id on every created row (R6).
- **Redirect `/bulk-import-centre`** to the Import Centre — closes GAP-001.
- **Typed template contract** replacing regex-by-column-name validation (D7).

**Exit:** one safe supplier import, reachable from the route users look for.

### Phase 2 — Supplier Master Intelligence

- **`resolveSupplier()` service** with the five-tier ladder (§5.2).
- **Route all three writers through it** (§1.4) — the structural fix.
- **Near-duplicate review UI**: propose, never auto-merge.
- **Supplier merge tool** with full provenance, for duplicates already in the data.
- Retire the admin supplier path once v1 supersedes it.

**Exit:** one supplier identity, however it entered the system.

### Phase 3 — Supplier Invoice Intelligence

- **Deterministic duplicate invoice detection** (§5.4) — the largest single gap in the invoice
  workflow, and the one with the clearest financial consequence.
- **VAT-number-first supplier matching** — the extracted `supplierVatNo` is captured and unused.
- **Item resolution shared with import** (§5.3).
- Reviewer correction of learned mappings (R7).
- Confidence-ordered review queue.

**Exit:** an invoice cannot be processed twice, and matching improves with use.

### Phase 4 — Purchase History Intelligence

- Price movement per supplier and item, built on the existing `vyron_supplier_price_history`.
- Invoice price vs PO price vs last approved price variance.
- Feed observed prices back into ingredient costing.

**Exit:** every extracted line is a data point in a price series.

### Phase 5 — Supplier Cost Intelligence

- Supplier scorecards from observed rather than declared data.
- Category inflation, contract-price adherence, alternative-supplier comparison.

### Phase 6 — Autonomous Procurement Intelligence

- Auto-approval of high-confidence invoices within rule thresholds (rules engine already exists).
- Predicted price movement; automated procurement recommendations.

**[INFERRED]** Phases 5 and 6 are only credible on data produced by Phases 1–4. Building them earlier
would produce confident analysis of duplicated suppliers and unverified prices — which is worse than
no analysis, because it is believed.

---

# PART 10 — Remaining Unknowns

Stated so they are not mistaken for settled facts. Each carries the decision it blocks.

**10.1 — Extraction accuracy on real-world documents.** No labelled corpus and no accuracy metric
exist. Performance on scanned, skewed, multi-page or low-DPI invoices is unmeasured.
*Blocks:* any auto-approval threshold (Phase 6) and any confidence cut-off.

**10.2 — Whether full-table preloads truncate at production volume** (§4.6 P2). Supabase applies a
default row cap; whether the reference tenant's ingredient and product counts reach it is unverified.
*Blocks:* trusting the current duplicate-skip behaviour at scale. **Answerable with one count query.**

**10.3 — Actual import volumes and durations.** No timing instrumentation exists in either pipeline.
*Blocks:* deciding whether batching is required in Phase 1 or deferrable.

**10.4 — Which import route customers actually use.** Four entry points; no usage telemetry.
*Blocks:* the retirement order in Phase 2. **Answerable from `vyron_import_runs.entity_type`.**

**10.5 — Whether suppliers reuse invoice numbers across periods** (R4). Determines whether tier-1
duplicate blocking must be period-scoped.
*Blocks:* the duplicate rule's exact form. Answerable from existing invoice data.

**10.6 — Current duplicate-supplier count in production.** The reference tenant holds 326 suppliers;
how many are near-duplicates is unknown.
*Blocks:* sizing the Phase 2 merge effort. Answerable with a normalised-name grouping query.

**10.7 — Bulk extract concurrency behaviour.** `documents/bulk-extract` exists; whether it serialises
or parallelises, and its interaction with `maxDuration = 120` and AI allowance, was not traced.
*Blocks:* bulk-processing guidance.

**10.8 — Whether `.xlsx` uploads currently fail loudly or silently.** Inputs accept `.xlsx`; no route
parses a workbook. Whether the user sees an error or a zero-row result was not verified at runtime.
*Blocks:* the severity rating of M11.

---

## Document status

**[VERIFIED]** Produced by direct inspection of the import pipelines, the document-intelligence
pipeline, the API routes, the client components, the Product Gap Register (read from branch without
checkout) and the SQL under `supabase/`.

**Limitations.** No code was executed and no runtime verification was performed — every behavioural
claim is from source reading, and claims about what a path *would* do are inferences from its code.
The document-intelligence review client (`vyron-document-review-client.ts`, 21.9KB) and
`vyron-customer-invoices.ts` (46.6KB) were not read in full; conclusions touching them are labelled
accordingly. All items in Part 10 remain open.

*This document is untracked, as directed. No production code, validation asset or repository safety
artefact was modified.*
