# VYRON — Production Acceptance Testing (PAT) Architecture & Implementation Plan

**Status:** Design artefact. Nothing in this document is implemented.
**Scope:** Establishes the standard validation environment for every VYRON product. Written against VYRON COST as the reference implementation.

---

## 0. How to read this document

Every capability below is labelled:

| Label | Meaning |
|---|---|
| **EXISTS** | Present in the repository today, verified by inspection |
| **PARTIAL** | Present but not fit for PAT in its current form |
| **TO BUILD** | Does not exist; must be implemented |

This labelling is deliberate. The ELD programme established that a documented
standard which describes future capability in the present tense causes engineers
to assume protections exist that do not. Nothing here is described as done.

---

## 1. Why this is urgent — the active risk

PAT is normally justified as *preventing* teams from testing against production.
In this repository that is not a hypothetical: **it is current practice.**

Verified by inspection:

- `scripts/` contains **~25 `test-*.mjs` certification scripts** and ~20 `tmp-*`
  probes.
- Each loads credentials by parsing **`.env.local`** directly
  (pattern established in `scripts/validate-schema-drift.mjs:4-9`).
- `.env.local` points at the **hosted production Supabase project**, carrying
  live customer data (the reference tenant holds 326 suppliers, 51 products,
  211 ingredients).
- These scripts **mutate that data**. Measured write-operation counts:

| Script | Write ops |
|---|---|
| `scripts/test-procurement-critical-workflow.mjs` | 17 |
| `scripts/test-finished-goods-critical-workflow.mjs` | 8 |
| `scripts/test-permissions.mjs` | 4 |

- They authenticate with `SUPABASE_SERVICE_ROLE_KEY`, which **bypasses
  Row-Level Security**. Tenant scoping is therefore not a safety boundary for
  these scripts — a wrong `company_id` in a test writes wherever it is pointed.

**Consequence:** every execution of the existing certification suite writes to a
live customer tenant. The PAT programme's first deliverable is not new test
coverage — it is redirecting an existing, actively-used suite away from
production.

> **Correction to the prior record.** During the ELD programme it was stated that
> "there is no automated test suite in this repository." That was based on
> `package.json` containing no test runner or framework, which is accurate, but
> it was incomplete: a large body of executable certification scripts exists.
> They are not registered with a runner, not in CI, and not isolated — but they
> exist and are used. The corrected statement is: **VYRON COST has substantial
> test tooling and no test infrastructure.**

---

## 2. PAT Architecture

### 2.1 Environment topology

Four environments, with PAT as a first-class peer of production:

| Environment | Purpose | Data | Who |
|---|---|---|---|
| **Local** | Development | Developer's own seed | Engineer |
| **PAT** | Acceptance testing, release gating | Synthetic, resettable | Engineering + QA |
| **Staging** *(optional, later)* | Pre-production rehearsal | Anonymised or synthetic | Release manager |
| **Production** | Live customers | Real | Customers |

PAT is **not** a shared developer sandbox. It is a controlled environment whose
state is defined by a seed, mutated only by tests, and reset on demand. If
engineers use it for exploratory work, its determinism is destroyed and every
gate built on it becomes unreliable.

### 2.2 Isolation model — **a separate Supabase project, not a separate tenant**

This is the single most important architectural decision in this document.

The tempting cheaper option is a dedicated `company_id` inside the existing
production project. **Reject it.** Reasoning:

- Server code and every existing script authenticate with the **service-role
  key**, which bypasses RLS entirely. Tenant isolation is enforced only by
  application-level `company_id` filtering.
- Therefore a single omitted `.eq("company_id", …)` in a test — or in the code
  under test — writes across tenants. The isolation boundary would be *the
  correctness of the thing being tested*, which is circular.
- The blast radius of that mistake is live customer data.

A separate Supabase project makes isolation a property of the **credentials**,
not of application logic. A test pointed at PAT cannot reach production because
the URL and keys resolve to a different database. That is a boundary that holds
even when the code under test is wrong — which is the entire point of a test
environment.

**Decision:** dedicated Supabase project `vyron-pat`, separate project ref,
separate keys, separate storage. **TO BUILD.**

### 2.3 Environment guard — fail-closed

Isolation by credentials is necessary but not sufficient; someone will
eventually run a PAT script with production env loaded. Add a mandatory guard
that every PAT-executable script must call before its first database operation:

Required behaviour:
1. `VYRON_ENV` must equal `pat`, else abort.
2. The resolved Supabase host must appear on a hard-coded PAT allowlist, else
   abort.
3. Abort means `process.exit(1)` **before** any client is constructed.
4. The guard is not bypassable by flag.

This is fail-closed: absence of correct configuration halts execution rather
than defaulting to whatever `.env.local` happens to contain — the exact failure
mode present today. **TO BUILD** (`scripts/pat/guard.mjs`).

### 2.4 Authentication

**EXISTS:** workspace session model (`src/lib/vyron-workspace-session.ts`),
permission checks (`src/lib/vyron-workspace-permissions.ts`), package gating
across `starter | professional | enterprise | multi_store_operations`
(`src/lib/vyron-package-manager.ts`), platform-admin allowlist via
`VYRON_PLATFORM_ADMIN_EMAILS`.

**TO BUILD:** a fixed set of PAT identities, one per role and package tier, with
committed non-secret credentials (PAT-only, never reused elsewhere). Required
because authorisation tests must assert both permitted **and denied** paths, and
denial can only be tested from an account that genuinely lacks the permission.

Minimum identity matrix:

| Identity | Role | Package | Purpose |
|---|---|---|---|
| `owner@pat.vyron.test` | Owner | Enterprise | Full-access baseline |
| `admin@pat.vyron.test` | Admin | Enterprise | Admin-gated routes |
| `supervisor@pat.vyron.test` | Supervisor | Professional | Approval workflows |
| `clerk@pat.vyron.test` | Standard | Professional | Least-privilege denial tests |
| `starter@pat.vyron.test` | Owner | Starter | Package-gating denial tests |
| `platform@pat.vyron.test` | Platform admin | — | Developer-area tests |

### 2.5 Database strategy

**Schema parity is the hard requirement.** A PAT environment on a drifted schema
produces false passes.

**EXISTS:** `scripts/validate-schema-drift.mjs` — already compares live schema
against expectations. This is a genuine asset and should become a **PAT
precondition**: drift check runs first; on failure the PAT run aborts rather
than reporting misleading results.

**TO BUILD:**
- Schema provisioning from migrations into `vyron-pat`.
- Deterministic seed (§3).
- Reset capability (§2.10).

Known tables (non-exhaustive, from inspection): `vyron_cost_products`,
`vyron_cost_stock_items`, `vyron_cost_purchase_orders`, `vyron_cost_suppliers`,
`vyron_cost_ingredients`, `vyron_cost_boms`, `vyron_documents`.

### 2.6 Storage strategy

**EXISTS:** Supabase Storage is used for document and branding uploads.

**TO BUILD:** PAT buckets in the PAT project, seeded from committed validation
assets (§4) and cleared by reset. Storage must reset **atomically with the
database** — orphaned objects or dangling references produce failures that look
like application defects but are environment artefacts, and engineers will waste
time chasing them.

### 2.7 Secrets management

**PARTIAL — this is the weakest area today.** Scripts parse `.env.local` by hand
(`validate-schema-drift.mjs:4-9`), so the production service-role key is loaded
by any script a developer runs.

Environment variables in use (22, from inspection):

```
NEXT_PUBLIC_SUPABASE_URL          NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY         NEXT_PUBLIC_APP_URL
OPENAI_API_KEY                    OPENAI_DOCUMENT_MODEL
OPENAI_DOCUMENT_FALLBACK_MODEL    VYRON_AI_ALLOWANCE_EXEMPT_COMPANY_IDS
XERO_CLIENT_ID                    XERO_CLIENT_SECRET
XERO_REDIRECT_URI                 XERO_SCOPE_MODE
XERO_STATE_SECRET                 VYRON_EMAIL_WEBHOOK_URL
VYRON_DOCUMENT_SUPERVISOR_PIN     VYRON_PLATFORM_ADMIN_EMAILS
VYRON_DEFAULT_TENANT_ID           NEXT_PUBLIC_VYRON_TENANT
NEXT_PUBLIC_VYRON_DEMO            NEXT_PUBLIC_VYRON_PIE_DEMO
PERMISSION_TEST_BASE              NODE_ENV
```

**TO BUILD:**
- `.env.pat` as a distinct, gitignored file; PAT scripts load **only** it and
  never fall back to `.env.local`.
- `VYRON_ENV` added as a required discriminator.
- A committed `.env.pat.example` documenting every variable with safe
  placeholders, so provisioning is reproducible.

### 2.8 AI provider configuration

**EXISTS:** OpenAI extraction, `gpt-4o` with `gpt-4.1` fallback, health endpoint
at `/api/document-intelligence/health`; AI usage metering with per-company
exemptions via `VYRON_AI_ALLOWANCE_EXEMPT_COMPANY_IDS`.

**Design decision — two modes**, because LLM extraction is non-deterministic and
metered, and those two properties break acceptance testing in different ways:

| Mode | Behaviour | Use |
|---|---|---|
| **Replay** (default) | Extraction responses served from committed fixtures keyed by document hash | Every gated run: deterministic, free, offline |
| **Live** (opt-in) | Real provider calls | Scheduled accuracy runs, prompt/model changes |

Rationale: if the gate depends on live extraction, an identical build passes and
fails on consecutive runs, and the team learns to re-run until green — which
destroys the gate's meaning. Replay makes *pipeline* correctness deterministic;
Live measures *extraction accuracy* as a tracked metric rather than a
pass/fail gate.

The PAT company must be added to the AI allowance exemption list so metering
does not distort results. **TO BUILD.**

### 2.9 Email, external integrations, logging, monitoring

| Concern | Today | PAT design |
|---|---|---|
| **Email** | `VYRON_EMAIL_WEBHOOK_URL`; invoice-by-email ingest | Point at a capture sink; assert on captured payloads. Never send to real addresses. **TO BUILD** |
| **Xero** | Full OAuth (`XERO_*`, 5 vars) | Xero **demo company** with separate credentials. Never production Xero. Contract tests may stub. **TO BUILD** |
| **Logging** | Console/server logs | PAT run produces a retained structured log per run, keyed by run id. **TO BUILD** |
| **Monitoring** | None for PAT | Track over time: pass rate, duration, extraction accuracy, flake rate. **TO BUILD** |

---

## 3. Test Data Strategy

### 3.1 Principles

1. **Deterministic.** Fixed UUIDs and fixed dates. Never `Math.random()`, never
   `new Date()` at seed time — a seed that varies produces tests that cannot
   assert exact values.
2. **Synthetic.** No production data, not even anonymised. Anonymisation
   pipelines leak; a synthetic corpus cannot.
3. **Small but complete.** Every entity relationship represented; volume only
   where a test needs it.
4. **Committed.** The seed is source-controlled and reviewed like code.

### 3.2 Dataset

| Entity | Volume | Notes |
|---|---|---|
| Companies | 3 | Enterprise, Professional, Starter — for package gating |
| Users | 6 | Per §2.4 identity matrix |
| Permissions/roles | Full matrix | Every role represented |
| Suppliers | 40 | Incl. 3 near-duplicates for duplicate detection; 2 with missing contact data |
| Customers | 20 | Incl. varied payment terms |
| Ingredients / raw materials | 60 | Incl. 5 with no supplier linkage |
| Products (finished goods) | 30 | Incl. 5 with no BOM (GAP-relevant) |
| BOMs | 20 | Incl. 1 deliberately circular, for error handling |
| Purchase orders | 25 | Across every status |
| GRNs | 15 | Incl. partial receipts |
| Supplier invoices | 20 | Matched, unmatched, and disputed |
| Customer invoices | 20 | For margin/reporting assertions |
| Stock movements | 200 | Sufficient for valuation maths |
| Attachments / images | Per §4 | |

**Volume caveat:** this corpus is sized for correctness, **not** performance.
Performance assertions (§5) against 40 suppliers prove nothing about a tenant
with 326. A separate large-volume seed is required before performance gating is
credible. **TO BUILD, and explicitly out of scope for the first PAT release.**

### 3.3 Reset

Required capability: restore PAT to the exact seed state, database **and**
storage, in a single command, in under two minutes.

Approaches, in order of preference:
1. **Snapshot restore** — Postgres template/branch restore. Fastest, most exact.
2. **Truncate + reseed** — simpler, slower, must handle FK order.

Reset must run **before** each gated PAT run, never only after. A run that
begins on residue from a failed prior run is not reproducible, and cleanup-only
strategies fail exactly when the previous run crashed — which is when clean
state matters most.

---

## 4. Validation Assets

Committed under `pat/assets/`, version-controlled, each with an expected-outcome
manifest. **TO BUILD.**

### 4.1 Supplier import files

| Asset | Expectation |
|---|---|
| `suppliers-valid-50.csv` | All rows import |
| `suppliers-valid.xlsx` | Excel parity with CSV |
| `suppliers-duplicates.csv` | Exact + fuzzy duplicates detected, not inserted |
| `suppliers-existing-update.csv` | Updates existing, creates none |
| `suppliers-malformed-headers.csv` | Rejected with actionable message |
| `suppliers-missing-required.csv` | Per-row errors, valid rows still importable |
| `suppliers-wrong-types.csv` | Type validation errors |
| `suppliers-empty.csv` | Handled, no crash |
| `suppliers-1-row.csv` | Boundary |
| `suppliers-5000-rows.csv` | Volume/timeout behaviour |
| `suppliers-utf8-accents.csv` | Encoding preserved |
| `suppliers-embedded-commas.csv` | Quoting handled |
| `suppliers-crlf.csv` / `-lf.csv` | Line-ending parity |
| `suppliers-bom-prefix.csv` | UTF-8 BOM stripped |
| `suppliers-formula-injection.csv` | `=cmd\|…` neutralised, not executed on export |

### 4.2 Invoice and document assets

| Asset | Expectation |
|---|---|
| `invoice-clean-1page.pdf` | Full extraction, high confidence |
| `invoice-clean-multipage.pdf` | Line items across page breaks |
| `invoice-scanned-300dpi.pdf` | OCR success |
| `invoice-scanned-150dpi.pdf` | Degraded, lower confidence |
| `invoice-skewed.pdf` | Rotation/skew handling |
| `invoice-handwritten-annotations.pdf` | Annotations must not corrupt extraction |
| `invoice-no-vat.pdf` | Zero-VAT handled |
| `invoice-multi-vat-rate.pdf` | Mixed rates apportioned |
| `invoice-credit-note.pdf` | Negative totals |
| `invoice-foreign-currency.pdf` | Currency detected or flagged |
| `invoice-unknown-supplier.pdf` | Routed to manual review, not silently matched |
| `invoice-totals-mismatch.pdf` | Arithmetic discrepancy flagged |
| `invoice-blank.pdf` | Graceful failure |
| `corrupt-truncated.pdf` | Rejected without crash |
| `not-really-a.pdf` (PNG renamed) | Content-type mismatch rejected |
| `oversized-60mb.pdf` | Size limit enforced |
| `zip-bomb.pdf` | Rejected |
| `logo-valid.png` / `-oversized.jpg` / `-corrupt.png` | Branding upload paths |

**Note on provenance:** every asset must be synthetic or generated. Real supplier
invoices contain third-party commercial data and must never enter the repository.

---

## 5. Acceptance Test Catalogue

Identifier scheme `PAT-<AREA>-<NNN>`. All **TO BUILD** unless marked.

### PAT-AUTH — Authentication
- 001 Valid login establishes workspace session
- 002 Invalid credentials rejected, no session
- 003 Session expiry forces re-authentication
- 004 Logout clears session; protected routes unreachable
- 005 Unauthenticated API returns 401 — **PARTIAL: verified ad-hoc during ELD**

### PAT-AUTHZ — Authorisation
- 001 Each role reaches only its permitted routes
- 002 Each role is **denied** non-permitted routes (denial is the assertion)
- 003 Package gating: Starter denied Enterprise features
- 004 Platform-admin area unreachable by tenant users
- 005 Cross-tenant read returns nothing
- 006 **Cross-tenant write is rejected** — highest-severity test in the catalogue
- 007 Existing coverage consolidated from `scripts/test-permissions.mjs` — **PARTIAL**

### PAT-CRUD — Core entities
- 001-008 Create/read/update/delete/soft-delete/validation/referential integrity/audit trail, per entity

### PAT-IMPORT — Imports
- 001 Valid CSV imports; summary counts correct
- 002 Excel parity
- 003 Duplicates detected, not inserted
- 004 Existing records updated, not duplicated
- 005 Malformed file rejected with actionable message
- 006 Partial success: valid rows import, invalid reported
- 007 **Rollback on mid-import failure leaves no partial state**
- 008 Volume import completes or fails cleanly
- 009 Encoding/line-ending/quoting matrix
- 010 Formula injection neutralised
- 011 Import audit trail recorded
- *Blocked by GAP-002 for suppliers specifically*

### PAT-EXTRACT — Invoice extraction
- 001 Clean PDF: supplier, number, date, lines, qty, price, VAT, total
- 002 Multi-page line continuation
- 003 Scanned OCR
- 004 Low-quality scan produces lower confidence, not silent error
- 005 Supplier matched to master
- 006 Unknown supplier routed to manual review
- 007 Product matching with confidence
- 008 Totals arithmetic validated against lines
- 009 Multi-VAT apportionment
- 010 Confidence scoring thresholds correct
- 011 Manual correction persists and is auditable
- 012 Corrupt file rejected without crash
- 013 Content-type mismatch rejected
- 014 Oversized file rejected
- 015 Extraction writes correct records
- 016 Audit trail complete
- 017 **Accuracy measured against a labelled corpus** (Live mode; metric, not gate)

### PAT-REPORT / PAT-DASH — Reporting and calculations
- Report generation, filters, exports (PDF/Excel), empty states
- Dashboard KPIs asserted against **hand-calculated** expected values from the
  fixed seed. Recomputing the expected value with the same code under test
  proves only self-consistency.
- Inventory valuation, GP %, margin, recovery calculations

### PAT-UX — Responsive and presentation
- Desktop 1920, tablet 1024, phone 390 render without layout break
- **PARTIAL: `scripts/visual-capture.mjs` EXISTS** — 13 workspaces × 3 viewports,
  built during ELD. Captures and reports console errors, redirects, HTTP status.
- **TO BUILD:** baseline image comparison. Today it captures; it does not diff.
  Without diffing, regressions are caught only if a human looks — which is how
  the semantic-colour and dark-page defects survived multiple ELD passes.

### PAT-ERR — Error handling
- Network failure, DB unavailable, AI provider down/rate-limited/timeout
- Concurrent edit conflict
- No stack traces or secrets in user-facing errors

### PAT-SEC — Security
- SQL injection via import fields and search
- XSS via stored fields rendered in UI
- File upload type/size enforcement
- Direct object reference to another tenant's record
- Secrets absent from client bundle
- Rate limiting on expensive endpoints

### PAT-PERF — Performance
- Page load, import duration, extraction duration, report generation
- **Explicitly non-gating in the first release** — thresholds must be established
  from measurement, and against a realistic corpus (§3.2). Publishing a gate on
  40-supplier data would be a fabricated threshold.

---

## 6. Release Gate

Six gates. **No release may bypass any required gate.** Each answers a distinct
question; none substitutes for another.

| # | Gate | Question | Today |
|---|---|---|---|
| 1 | **Build Validation** | Does it compile? | **EXISTS** — `tsc --noEmit`, `next build` |
| 2 | **Mechanical Validation** | Was any transformation applied correctly? | **TO BUILD** — post-condition checks per Automated Refactoring Standards |
| 3 | **Functional Validation** | Does behaviour still work? | **TO BUILD** — PAT catalogue §5 |
| 4 | **UX Validation** | Does it present correctly? | **PARTIAL** — capture exists, diffing does not |
| 5 | **PAT Validation** | Full suite green on reset PAT? | **TO BUILD** |
| 6 | **Production Approval** | Human sign-off | **EXISTS** — process |

### Gate detail

**Gate 1 — Build.** TypeScript clean; production build exit 0; ESLint not worse
than the recorded baseline (**6,691 problems / 287 errors** as of the ELD
programme). Baseline-not-worse rather than clean, because 287 pre-existing
errors cannot block release today; a ratchet reduces the number over time
without blocking now.

**Gate 2 — Mechanical.** Required whenever a change set includes a bulk or
automated transformation. Post-conditions defined **before** execution, asserted
on output grammar rather than intent, run across the complete change set. The
ELD programme demonstrated the failure this prevents: twelve malformed CSS class
names passed TypeScript, build and Playwright, and were caught only by manual
inspection of transformed text.

**Gate 3 — Functional.** PAT catalogue executed against reset PAT. Any
**Critical** failure blocks. Prerequisite: schema drift check passes.

**Gate 4 — UX.** Captures across three viewports, diffed against approved
baselines. Unexplained diff blocks; intentional diff requires baseline re-approval.

**Gate 5 — PAT Validation.** Full suite, reset environment, clean run, retained
evidence: run id, commit SHA, seed version, pass/fail per test, durations,
captured artefacts.

**Gate 6 — Production Approval.** Human decision, recorded, referencing the
Gate 5 evidence bundle.

### Severity

| Severity | Effect |
|---|---|
| **Critical** | Blocks release unconditionally — auth, authz, cross-tenant, data loss, import corruption, financial calculation |
| **Major** | Blocks unless explicitly waived in writing with an owner and a date |
| **Minor** | Recorded in the Product Gap Register; does not block |

---

## 7. Repository Governance Integration

| Artefact | Relationship |
|---|---|
| **`docs/PRODUCT-GAP-REGISTER.md`** *(exists, branch `docs/product-gap-register`)* | Bidirectional. A PAT failure that is a known gap, not a regression, is recorded here and the test marked `known-gap` — visible, non-blocking, not silently skipped. Conversely, each register entry should acquire a PAT test proving closure. GAP-001/002 gate `PAT-IMPORT-*` for suppliers; GAP-003 becomes `PAT-ERR-00x` |
| **`docs/REPOSITORY-GOVERNANCE.md`** *(specified, not created — awaiting Executive Merge Decision)* | Owns merge order, generated-artefact handling, **Automated Refactoring Standards**, and validation evidence retention. Gate 2 is defined there and invoked here |
| **Merge Checklist** | Gates 1, 2, 4. Presentation-only branches may merge on these plus diff analysis — the amended ELD gate. Functional branches additionally require Gate 3 |
| **Release Checklist** | All six gates, evidence bundle attached |
| **Engineering Standards** | PAT is where "verify the transformation *and* the result" becomes executable rather than aspirational |

---

## 8. Implementation phases

Sequenced so the highest-severity risk closes first.

| Phase | Deliverable | Closes |
|---|---|---|
| **P1** | PAT Supabase project; `.env.pat`; `VYRON_ENV`; fail-closed guard; **migrate the ~25 existing scripts onto the guard** | **The active production-write risk (§1)** |
| **P2** | Deterministic seed + reset; schema-drift check as precondition | Repeatability |
| **P3** | Validation assets (§4) with expected-outcome manifests | Test inputs |
| **P4** | Test runner; consolidate existing scripts into the catalogue; PAT-AUTH + PAT-AUTHZ (Critical) | Gate 3 foundation |
| **P5** | PAT-IMPORT, PAT-EXTRACT (replay mode) | Core workflows |
| **P6** | Baseline diffing on the existing capture tool | Gate 4 |
| **P7** | Live-mode accuracy runs; performance corpus and thresholds | Measurement |
| **P8** | Full gate enforcement in the release checklist | Governance |

**P1 is independently valuable and should not wait for the rest.** It requires
no new tests — only redirection and a guard — and it stops live customer data
being mutated by routine engineering activity. Everything after P1 is
improvement; P1 is remediation.

---

## 9. Known limitations of this design

Stated so they are not discovered later as surprises:

1. **Replay mode does not test the AI provider.** It proves the pipeline around
   extraction. Provider regressions surface only in scheduled Live runs.
2. **The correctness corpus cannot support performance gating.** Thresholds
   require the large-volume seed (§3.2), which is deferred.
3. **Visual diffing has no baselines yet.** Until captured and approved, Gate 4
   remains partial and human-dependent.
4. **PAT proves the application, not the deployment.** Infrastructure,
   migrations against production volume, and rollback are outside this scope and
   need a separate deployment-verification programme.
5. **No CI.** Every gate here is executed manually until a pipeline exists. A
   gate that depends on someone remembering is weaker than its description
   implies, and this document should not be read as claiming otherwise.
