# VYRON COST — Test Infrastructure Audit

**Programme:** PAT Phase 0 — Discovery
**Status:** Investigation complete. No production code, scripts, branches or commits were modified.
**Scope:** Every testing, certification, verification and validation asset in the repository.
**Method:** Full or substantial inspection of all 54 executable assets. Sampling is declared explicitly wherever it occurred (§11).

---

## 1. Executive Summary

The repository contains **54 executable validation assets** — 53 under `scripts/`, one under
`.tmp-fg-cert/`. **All 53 in `scripts/` are git-tracked**, including every file named `tmp-*`.
The `tmp-` prefix communicates "throwaway"; version control says otherwise. Nothing here is
temporary in any sense the repository enforces.

There is **no test runner, no test framework, no CI, and no execution policy**. `package.json`
registers exactly three of these 54 assets as npm scripts (`validate:schema`, `import:handcrafted`,
`generate:pwa-icons`). The other 51 are invoked by hand, by whoever remembers they exist.

The PAT Architecture (`docs/PAT-ARCHITECTURE.md` §1) correctly identified that a large body of
certification scripts exists and performs writes. This audit confirms that, and materially
**changes the shape of the risk in three ways**:

**1. The dominant pattern is safer than assumed — but it leaks.**
26 of the writing scripts follow an *ephemeral-tenant* pattern: create a fresh auth user, company,
workspace and membership stamped with `Date.now()`, drive the scenario through the HTTP API, then
delete what they created in a `finally` block. They do **not** mutate existing customer records.
This is a genuine engineering asset and is more disciplined than §1 of the PAT Architecture implies.
However: **7 scripts have no cleanup whatsoever**, and a further group cleans up only partially,
orphaning products, BOMs, stock items and production runs whose parent company row has been deleted.

**2. A second family of scripts is categorically more dangerous — and was not previously identified.**
Six scripts do not create a sandbox. They **query the database for a workspace with a live,
connected Xero organisation, insert themselves into it as `OWNER`, and drive real integration
traffic through it.** Between them they overwrite the tenant's company-wide Xero account mapping,
rotate its OAuth refresh token, resynchronise its chart of accounts, and **push invoices into the
live Xero accounting system**. One script extracts the stored OAuth access token from the database
and calls `api.xero.com` directly, bypassing the application. The cleanup blocks delete local rows;
**nothing in the repository can undo what was written to Xero.** This is the single highest-severity
finding of the audit (§5.1).

**3. Two live session credentials are committed to version control.**
`scripts/tmp-preview-e2e.ps1:4` contains a hard-coded workspace session cookie carrying a real user
id, real email address, real company id, real trading name, and `"impersonating":true` — pointed at
a deployed Vercel URL. `cookies-test.txt` is a tracked Netscape cookie file holding the same two
session cookies. These are credentials and third-party-identifiable data in git history (§5.2).

**One open question outranks all remediation work.** `.env.local` — the file all 47 database-touching
scripts parse directly — points at Supabase project `bzzlhzgfvnnwxjxvpzdk`. `.env.example` documents
the production project as `ldnrmgafsquzfitcuvxq`. **These are different projects, and the repository
does not contain evidence sufficient to determine which one carries live customer data.** Every risk
rating below is conditional on that answer. Resolving it takes minutes and must happen first (§6.1).

**Coverage is strong in procurement, permissions and master data; absent in imports, document
extraction, security and performance** — precisely the areas the PAT catalogue rates Critical.

---

## 2. Method and evidence standard

Every conclusion below is anchored to a file and, where useful, a line number. The approach was:

1. **Inventory.** Full recursive listing of `scripts/`, plus a repository sweep for validation
   assets outside it (`visual-validation/`, `.tmp-fg-cert/`, `docs/`, `supabase/`).
2. **Structural matrix.** Mechanical extraction per file of: Supabase operation counts
   (`insert`/`update`/`delete`/`upsert`/`select`/`rpc`), `.storage` usage, `fetch` counts,
   credential variable referenced, env-loading mechanism, tables touched via `.from(...)`,
   cleanup style, and `auth.admin` usage.
3. **Inspection.** Each script then read. Small files (<250 lines) were read in full. Large files
   were read in full at the head (env loading, credential resolution, tenant construction) and at
   the cleanup block, with targeted reads of the assertion body. Grep was used to *locate*, never
   to *classify*.
4. **Corroboration.** Application source was read where a script's behaviour depended on it — the
   documents upload route and `src/lib/vyron-documents.ts` to establish the storage bucket, and
   `src/app/api/**` to establish which endpoints reach OpenAI.

Where a classification rests on partial reading, §11 says so by name.

---

## 3. Inventory and classification

### 3.0 Shared characteristics

**Every one of the 47 database-touching scripts is identical in three respects**, and these three
facts drive most of the risk in this document:

| Property | Evidence |
|---|---|
| Credentials are loaded by **hand-parsing `.env.local`** — no `dotenv`, no override, no validation | Canonical form at `scripts/validate-schema-drift.mjs:4-10`; replicated verbatim or near-verbatim in all 47 |
| Authentication is **`SUPABASE_SERVICE_ROLE_KEY`** — Row-Level Security is bypassed in every case | `SERVICE_ROLE` present in all 47; no script uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| There is **no environment discriminator** — no `VYRON_ENV`, no host allowlist, no guard | Repository-wide search for `VYRON_ENV` returns zero matches outside `docs/PAT-ARCHITECTURE.md` |

The consequence: **a script cannot tell which database it is connected to, and nothing stops it
connecting to any of them.** The only control is which values happen to be in `.env.local` at the
moment of execution. That is the failure mode PAT §2.3 was written to close, and it is unmitigated
today.

**The 34 scripts that drive the application** additionally require a Next.js server at
`http://localhost:3007` (`NEXT_PUBLIC_APP_URL` or `PERMISSION_TEST_BASE` where overridden). They
write through real API routes, so they exercise real business logic — a genuine strength — but it
also means **the database they mutate is whichever database the running dev server is pointed at**,
which need not match the one the script itself connected to. Nothing asserts the two agree.

### 3.1 Class A — Source-mutating codemods (2 assets)

These do not test anything. They **rewrite production source files** and are still runnable.

| Script | Lines | Behaviour | Env | Auth | DB | Risk |
|---|---|---|---|---|---|---|
| `apply-api-permission-guards.mjs` | 167 | Injects `requireWorkspacePermission(...)` into **43 named API route handlers** under `src/app/api`; rewrites 500-error returns to `workspaceAccessErrorResponse`. Writes files directly. | Local FS | None | None | **MEDIUM** |
| `fix-api-guard-placement.mjs` | 41 | Globs `src/app/api/**/route.ts` and relocates misplaced guards via regex. Repairs the previous script's output. | Local FS | None | None | **MEDIUM** |

**Findings.**
- Both are **idempotent by intent** (they check for an existing guard before injecting) but operate
  by regex and brace-counting on TypeScript source. Re-running them against source that has since
  been hand-edited is not safe in the general case.
- `fix-api-guard-placement.mjs:2` imports `glob`, which is **not declared in `package.json`** —
  neither in `dependencies` nor `devDependencies`. It resolves today only if a transitive dependency
  happens to provide it. This script is one `npm ci` away from failing.
- The existence of a second script whose only purpose is repairing the first is exactly the failure
  mode PAT Gate 2 (Mechanical Validation) exists to prevent: a bulk transformation applied without
  post-condition assertions, whose defects were found afterwards.
- **These belong in `tools/`, not `scripts/`, and should be retired now that the guards are in place.**

### 3.2 Class B — Build and data tooling (3 assets)

| Script | Lines | Behaviour | Env | Auth | DB | Risk |
|---|---|---|---|---|---|---|
| `generate-pwa-icons.mjs` | 97 | `sharp` + `to-ico`: renders 11 icon sizes and 9 splash images from `public/vyron-cost-app-icon.svg`. | Any | None | None | **SAFE** |
| `import-handcrafted.mjs` | 717 | Reads three Excel workbooks from `data/handcrafted-import/`, emits `data/generated/handcrafted-tenant.json`. Pure file transformation. | Any | None | None | **SAFE** |
| `visual-capture.mjs` | 87 | Playwright: 13 workspace routes × 3 viewports (1920/1024/390), full-page screenshots to `visual-validation/`, plus `report.json` recording console errors, redirects and HTTP status. | Local (`:3007`) | Browser session only | None | **SAFE** |

**Findings.**
- `visual-capture.mjs` is the **highest-quality asset in the repository** and the only one already
  designed as reusable infrastructure: parameterised base URL, structured output, explicit
  distinction between "rendered", "auth-gated" and "failed". It touches no database.
- Its one gap is the one PAT §5 already names: **it captures, it does not diff.** `visual-validation/`
  is gitignored (`.gitignore:45`), so there are no committed baselines and no possible comparison.
- Note the asymmetry at `visual-capture.mjs:69` — `fullPage` is true only for desktop. Tablet and
  phone captures are viewport-clipped, so below-the-fold regressions on those two viewports are
  invisible even to a human reviewer. This should be corrected before baselines are approved.

### 3.3 Class C — Read-only database probes (14 assets)

All 14 connect with the service-role key and issue only `SELECT`. **No writes. No storage. No
external services.** All are **SAFE against any environment**, subject to §3.0's caveat that they
read whatever `.env.local` points at — meaning they can read live customer data, which is a
confidentiality consideration, not an integrity one.

| Script | Lines | Purpose | Notes |
|---|---|---|---|
| `validate-schema-drift.mjs` | 190 | **22 tables** probed by selecting an exact column list; each failure carries a specific migration hint. Exit 1 on drift. | Registered as `npm run validate:schema`. The strongest asset in this class. |
| `deployment-verification-remaining-modules.mjs` | 608 | Declarative requirements model across **21 modules** (tables, columns, FKs, indexes, views, functions). Writes `deployment-gap-report.json`. | Honestly records what it *cannot* verify — see below. |
| `verify-sales-order-schema.mjs` | 307 | Sales-order schema via `information_schema` / `pg_indexes` / `table_constraints`. | Catalog access is blocked (below) — likely non-functional. |
| `verify-sales-order-schema-runtime.mjs` | 169 | Same target, but via table/column probes that work through PostgREST. | The working replacement for the above. |
| `tmp-schema-probe.cjs` | 36 | Row counts across 15 manufacturing/inventory tables. | |
| `tmp-schema-alignment-probe.cjs` | 15 | Column-list probe: stock counts, count lines, finished goods. | |
| `tmp-column-exists-probe.cjs` | 20 | Per-column existence probe, incl. speculative columns (`warehouse_id`, `location_id`). | Discovery aid. |
| `tmp-manufacturing-audit.cjs` | 32 | Column-list probe across 8 production tables. | |
| `tmp-inventory-foundation-audit.cjs` | 36 | Column-list probe across 11 inventory tables, incl. probes for tables that may not exist. | |
| `tmp-meta-probe.cjs` | 25 | Tests whether `information_schema`, `pg_indexes`, `pg_constraint`, `supabase_migrations` are reachable. | Capability probe. |
| `tmp-migration-history-probe.mjs` | 24 | Searches 6 candidate migration-history table names. | |
| `tmp-check-product-financial-columns.mjs` | 26 | `information_schema.columns` filtered to `financial_%` on `vyron_cost_products`. | Depends on blocked catalog access. |
| `tmp-live-constraint-proof.mjs` | 62 | Probes `vyron_db_constraint_definitions`, `information_schema`, `pg_catalog`, **and whether `run_sql` / `exec_sql` RPCs exist**. | Security-relevant — see below. |
| `tmp-xero-live-target-check.mjs` | 41 | Lists every workspace with a Xero connection; reports which have live tokens and tenant ids. | **Reconnaissance for the Class E family — see §5.1.** |

**Findings.**

- **PostgreSQL catalog introspection is unavailable through PostgREST in this deployment.** This is
  recorded independently in two places: `deployment-gap-report.json:115-118`
  (*"Direct catalog introspection for indexes/foreign keys/functions/views via
  information_schema/pg_catalog is blocked in current PostgREST exposure"*) and
  `verify-sales-order-schema-runtime.mjs:172-173`. **Consequence:** `verify-sales-order-schema.mjs`
  and `tmp-check-product-financial-columns.mjs` query interfaces that do not answer, and index /
  foreign-key / view / function verification **cannot be performed by any script in this
  repository.** Schema verification is therefore limited to *tables and columns*. Any claim of
  schema parity is partial, and PAT §2.5's "schema parity is the hard requirement" cannot currently
  be met by these tools.

- `tmp-live-constraint-proof.mjs:64-72` probes for `run_sql` and `exec_sql` RPCs — i.e. whether
  arbitrary SQL execution is exposed through PostgREST. The script passes a harmless `select 1`, so
  it is read-only in effect, but **its result is a security fact worth recording deliberately
  rather than rediscovering.** If either RPC exists and is reachable with the anon key, that is a
  critical finding in its own right. Run it, record the answer, retire the script.

- **Eight of these fourteen overlap substantially.** `validate-schema-drift.mjs`,
  `tmp-schema-probe.cjs`, `tmp-schema-alignment-probe.cjs`, `tmp-column-exists-probe.cjs`,
  `tmp-manufacturing-audit.cjs`, `tmp-inventory-foundation-audit.cjs`,
  `verify-sales-order-schema-runtime.mjs` and `deployment-verification-remaining-modules.mjs` all
  implement the same primitive — *select a column list, interpret the error*. They differ only in
  the table list. This is one function and eight data files, currently written as eight programs.

### 3.4 Class D — Ephemeral-tenant certification suite (26 assets)

The main body of work. Shared shape, established by inspection of all 26:

```
create auth user (auth.admin.createUser, Date.now()-stamped email)
create vyron_cost_companies row
create vyron_workspaces row
upsert vyron_user_profiles
insert vyron_workspace_memberships (role: OWNER)
POST /api/workspace/login  ->  session + client cookies
... drive scenario through real HTTP API routes, assert on responses and on DB state ...
finally: delete created rows, then auth.admin.deleteUser
```

**This pattern does not mutate pre-existing tenant data.** That is the single most important
correction this audit makes to the prior risk assessment. What it *does* do is create and destroy
real rows — including real `auth.users` — in whichever database `.env.local` names.

#### 3.4.1 The 26, with cleanup integrity assessed

Cleanup integrity is the axis that matters, because it determines what a **failed or interrupted
run** leaves behind. `finally` does not run on `SIGINT`, on `process.exit()` inside the try, or on
host/network death.

| Script | Lines | Module | Tables | Cleanup | Integrity |
|---|---|---|---|---|---|
| `test-branches-warehouses-module-certification.mjs` | 705 | Branches / Warehouses / Store Orders | 29 | `cleanupWorkspace` — 29 tables in FK order, plus per-email user teardown | **Complete** — reference implementation |
| `test-procurement-critical-workflow.mjs` | 297 | Procurement / PO / GRN | 12 | `finally` — 8 child tables, then workspace, company, profile, auth user | **Complete** |
| `test-po-enterprise-hardening.mjs` | 295 | PO hardening, attachments, email | 14 | `finally` — incl. `vyron_documents` by `tenant_id` | **Complete for DB; storage orphaned** (§5.3) |
| `test-user-management-module-certification.mjs` | 401 | User management | 4 | `cleanup` — tracked `createdUserIds` array + workspace | **Complete** |
| `test-companies-module-certification.mjs` | 407 | Companies / platform admin | 5 | `cleanupWorkspace` + `cleanupUserByEmail` | **Complete, but fragile** — see below |
| `test-pdf-export-module-certification.mjs` | 267 | Report exports | 5 | `cleanup` — tracked `seededStockItemIds` + workspace | **Complete** |
| `test-roles-permissions-module-certification.mjs` | 380 | Roles / permissions | 4 | `cleanup` × 2 tenants | **Complete** |
| `test-uom-module-certification.mjs` | 267 | Units of measure | 4 | `cleanup` — workspace/company/user only | **Partial** — module rows orphaned |
| `test-manufacturing-lifecycle-enterprise.mjs` | 476 | Manufacturing lifecycle | 9 | `cleanupWorkspace` — workspace/company only | **Partial** — production runs, run lines, audit log, products, stock items, finished goods all orphaned |
| `test-finished-goods-enterprise-phase8.mjs` | 603 | Finished goods (Phase 8) | 5 | `cleanupWorkspace` — workspace/company only | **Partial** — plus storage orphaned |
| `test-finished-goods-critical-workflow.mjs` | 304 | Finished goods (critical path) | 4 | `finally` — workspace/company/user | **Partial** |
| `test-master-data-integrity-audit.mjs` | 396 | Master data cross-module | 4 | `finally` — workspace/company/user | **Partial** |
| `test-intelligence-modules-certification.mjs` | 184 | AI dashboards, forecasting, search | 4 | `cleanup(ctx)` helper | **Complete** |
| `tmp-deployment-verification.mjs` | 601 | Cross-module deployment check | 12 | `finally` — invoice lines/header, workspace, company, user | **Partial** — products, stock items, ledger, audit log orphaned |
| `tmp-customer-invoice-production-check.mjs` | 400 | Customer invoicing | 10 | `finally` | **Partial** |
| `tmp-customer-invoice-validation.mjs` | 236 | Customer invoice validation | 9 | `finally` | **Partial** |
| `tmp-customer-balance-statement-check.mjs` | 204 | Customer balances / statements | 6 | `finally` | **Partial** |
| `tmp-runtime-failure-probe.mjs` | 86 | Inventory adjustment failure repro | 8 | `finally` | **Partial** — product and stock item never deleted |
| `tmp-status-check-behavior.mjs` | 45 | Invoice status CHECK-constraint probe | 2 | `finally` — invoice + company | **Complete** |
| `test-client-archive.mjs` | 84 | Workspace archive / delete | 2 | **None** — relies on the DELETE API being reached | **Leaks on any early exit** |
| `test-permissions.mjs` | 167 | Permission enforcement | 4 | **None** | **Leaks unconditionally** |
| `test-invoice-stock.mjs` | 248 | Invoice → stock posting / reversal | 7 | **None** | **Leaks unconditionally** |
| `test-recipes-api.mjs` | 186 | Recipe / BOM API | 5 | **None** | **Leaks unconditionally** |
| `test-customer-selector.mjs` | 114 | Customer selector normalisation | 3 | **None** | **Leaks unconditionally** |
| `test-manage-login.mjs` | 80 | Owner login provisioning | 2 | **None** | **Leaks unconditionally** |
| `test-customer-sales-orders-workflow.mjs` | 417 | Sales orders | 7 | **None** | **Leaks unconditionally** |

#### 3.4.2 Findings

**(a) Seven scripts leak permanently, by design, on every successful run.**
`test-permissions.mjs`, `test-invoice-stock.mjs`, `test-recipes-api.mjs`, `test-customer-selector.mjs`,
`test-manage-login.mjs`, `test-customer-sales-orders-workflow.mjs` have no `finally`, no cleanup
function, and no delete calls. `test-client-archive.mjs` cleans up only by reaching its final API
call — and exits early via `process.exit(1)` at five separate points before it.

`test-permissions.mjs` is the clearest case. In 167 lines it creates a company, a workspace, an auth
user, a user profile, a membership, **and a supplier via the owner's own API** (line 165-174) — and
deletes none of it. **Every execution permanently adds a tenant and two users.** It is one of the
three scripts PAT §1 already names.

**(b) Partial cleanup produces orphans that are worse than no cleanup.**
`test-manufacturing-lifecycle-enterprise.mjs` creates products, BOMs, stock items, production runs,
run lines and a production audit trail — then deletes only the workspace and company rows
(`cleanupWorkspace`, 3 statements). The child rows survive with a `company_id` pointing at a company
that no longer exists. These are invisible to every tenant-scoped query in the application and will
never be found by inspection. The same applies to `test-finished-goods-enterprise-phase8.mjs`,
`test-uom-module-certification.mjs`, `tmp-deployment-verification.mjs` and the three
`tmp-customer-invoice-*` scripts.

**(c) Real platform administrators are created.**
`test-companies-module-certification.mjs:75-84` upserts into `vyron_platform_users` with
`role: "PLATFORM_ADMIN", is_active: true` — the highest privilege in the system. Cleanup is by
**email lookup across paginated `auth.admin.listUsers`, capped at 10 pages × 200 = 2,000 users**
(`cleanupUserByEmail`, lines 164-179), and returns silently on any error. In a database with more
than 2,000 auth users the cleanup **silently fails and an active platform administrator persists.**
This is the most severe consequence of leakage in the Class D suite.

**(d) Determinism is absent.**
Every script keys its fixtures on `Date.now()`; `test-companies-module-certification.mjs:67`
additionally uses `Math.random()`. No script uses a fixed UUID or a fixed date. Re-running a script
produces a different tenant, so **no assertion can reference an exact expected value** and no run is
reproducible. This directly contradicts PAT §3.1 principle 1 and is the main structural obstacle to
converting these into PAT assets.

**(e) Failure reporting is inconsistent, and one style is actively harmful.**
Three idioms coexist: accumulate-then-report (`checks` Map — procurement, intelligence, FG Phase 8),
fail-fast `throw` (recipes, invoice-stock, roles), and structured-diagnostic-then-`process.exit(2)`
(the `tmp-*-cert` family). The fail-fast scripts stop at the first failure, so **a single early
defect masks every later assertion** — a script reporting one failure may be concealing twenty.
`test-roles-permissions-module-certification.mjs` is the clearest example: eight validation
dimensions, any one of which aborts the rest.

The `tmp-*-cert` family's diagnostic format — `{module, runtimeStep, rootCause, exactFile,
smallestFix}` — is genuinely excellent and should become the PAT failure schema.

**(f) Two assertions expect unauthenticated access to succeed.**
`test-intelligence-modules-certification.mjs:176` and `:179` call
`/api/enterprise-platform/search?q=margin` and `/api/enterprise/auditor-search?q=risk`
**without passing cookies**, and assert `ok: true`. Every other call in that file passes
`ctx.cookies`. The suite therefore *encodes an expectation* that these two search endpoints are
publicly reachable. That is either a deliberate design decision that should be documented, or an
authentication gap that the certification suite is currently locking in. **It needs a decision, not
an assumption.**

### 3.5 Class E — Live-tenant integration scripts (6 assets)

**This class is the reason this audit was commissioned, and it was not previously characterised.**

These scripts do not create a sandbox. Their first action is to **search the database for a
workspace belonging to a real customer with a live Xero connection**, and adopt it.

The selection predicate is explicit — from `tmp-enterprise-financial-certification.mjs:80-83`:

```js
const live = (rows || []).find((row) => {
  const c = row.connection || {};
  return Boolean(UUID_RE.test(String(row.workspace_id || "").trim())
    && c.connected && c.accessToken && c.refreshToken
    && c.tenantId && c.tenantId !== "—");
});
```

They then resolve that workspace's **real `company_id`**, create an auth user, and insert it as
`OWNER` of the customer's workspace:

```js
const membership = await supabase.from("vyron_workspace_memberships").insert({
  workspace_id: workspaceId,          // <- the live customer's workspace
  user_id: userId,
  role: "OWNER",
  status: "Active",
  joined_at: new Date().toISOString(),
});
```

Everything subsequent runs **inside the customer's tenant, with owner privileges, against their
connected accounting system.**

| Script | Lines | What it writes to the live tenant / Xero |
|---|---|---|
| `tmp-xero-live-target-check.mjs` | 41 | Nothing. **Enumerates which workspaces hold live Xero tokens** — the reconnaissance step for the rest. |
| `tmp-enterprise-financial-certification.mjs` | 247 | `select-organisation`; `sync-from-xero` chart-of-accounts resync into the customer's company scope. |
| `tmp-enterprise-financial-full-certification.mjs` | 586 | As above, plus product/category/customer/invoice records under the live `company_id`. |
| `tmp-invoice-export-mapping-cert.ts` | 219 | **`save-defaults`** — overwrites the company-wide Xero account mapping; `save-category`; `save-product`; creates products. |
| `tmp-product-overrides-runtime-cert.ts` | 286 | **`save-defaults`**, `save-category`, `save-product`, products. |
| `tmp-product-overrides-only-cert.mjs` | 376 | All of the above, **plus three real invoices pushed into the live Xero organisation**, plus a direct call to `api.xero.com` using the customer's OAuth token. |
| `tmp-xero-integration-regression-probe.mjs` | 80 | **`refresh-token`** (rotates the live OAuth refresh token), `select-organisation`, `sync-from-xero`, **`sync-all-customers-now`, `sync-all-suppliers-now`, `sync-all-invoices-now`**. |

Detailed analysis is in §5.1. **All six are UNSAFE AGAINST PRODUCTION and none should be executed
again in their current form under any circumstances.**

### 3.6 Class F — PowerShell and out-of-tree assets (3 assets)

| Script | Lines | Behaviour | Risk |
|---|---|---|---|
| `tmp-preview-e2e.ps1` | 61 | Document-intelligence E2E against a **deployed Vercel preview URL** using a **hard-coded real session cookie**. Generates a minimal PDF, uploads it, calls `/api/documents/{id}/extract`, captures before/after review payloads. | **HIGH** |
| `tmp-run-marker.ps1` | 2 | Writes a marker file. Dead. | **SAFE** |
| `.tmp-fg-cert/certify-fg-export.mjs` | ~400 | Finished-goods export certification. Reads session cookies from a **Netscape cookie file**, exercises CSV/XLSX export paths (`exceljs`), writes `cert-results.json`. Fixtures (`single.csv`, `multi.csv`, `filtered.csv`, `empty.csv`, `permission-denied.csv`, `multi.xlsx`) are committed alongside. | **MEDIUM** |

**Findings.**
- `tmp-preview-e2e.ps1` is the **only asset in the repository that exercises the AI document
  extraction pipeline** — the highest-value and most expensive subsystem in the product. It is also
  the most compromised asset in the repository (§5.2), and it is **not runnable**: every path is
  hard-coded to `C:\Users\humres\vyron-cost-web\`, a different machine's user profile. It documents
  a workflow nobody can currently execute.
- `.tmp-fg-cert/` is the **only place in the repository holding committed validation fixtures with
  expected outcomes** — exactly the pattern PAT §4 proposes. The directory name marks it as
  temporary; the fixtures are the beginnings of the asset library PAT needs. **Promote, do not
  delete.**

---

## 4. Environment, authentication, database, storage and external services

### 4.1 Environment

| Environment | Scripts targeting it | Evidence |
|---|---|---|
| **Unknown / whatever `.env.local` contains** | **47** | All 47 hand-parse `.env.local`; none validates the resolved host |
| **Local dev server (`localhost:3007`)** | **34** | `NEXT_PUBLIC_APP_URL \|\| "http://localhost:3007"`; `test-manage-login.mjs:14` hard-codes it with no override |
| **Deployed Vercel preview** | **1** | `tmp-preview-e2e.ps1:3` — `https://vyron-cost-2nfn92fwa-base2gvs-projects.vercel.app` |
| **None (filesystem only)** | **5** | Classes A and B |
| **PAT** | **0** | No PAT environment exists |

**No script declares its intended environment. No script can detect the wrong one.** The
`NEXT_PUBLIC_APP_URL` default is the only thing keeping 34 scripts pointed at localhost — and it is
a *default*, meaning **if `.env.local` sets `NEXT_PUBLIC_APP_URL` to a deployed URL, 33 of those 34
scripts silently retarget to it**, writing through the deployed application. `test-manage-login.mjs`
is the sole exception, by accident rather than design.

### 4.2 The credential question — highest priority open item

| Source | Supabase project | Evidence |
|---|---|---|
| `.env.local` — read by all 47 scripts | **`bzzlhzgfvnnwxjxvpzdk`** | `NEXT_PUBLIC_SUPABASE_URL=https://bzzlhzgfvnnwxjxvpzdk.supabase.co/rest/v1/` |
| `.env.example` — documented as production | **`ldnrmgafsquzfitcuvxq`** | `.env.example:13-14` — *"# Production project: https://ldnrmgafsquzfitcuvxq.supabase.co"* |
| `src/supabase/deploy/xero_deployment_baseline.sql:2` | **`ldnrmgafsquzfitcuvxq`** | *"Run once in Supabase SQL Editor (https://ldnrmgafsquzfitcuvxq.supabase.co)"* |
| `deployment-gap-report.json:26` (generated 2026-07-09) | **`bzzlhzgfvnnwxjxvpzdk`** | `"connectedDb": "https://bzzlhzgfvnnwxjxvpzdk.supabase.co"` |
| `.vercel/.env.preview.local` | **not determinable** | `NEXT_PUBLIC_SUPABASE_URL=""` — value not present in the local pull |

**Two distinct Supabase projects are in play, and the repository does not establish which holds live
customer data.** Both were used by real tooling within the last month of recorded activity.

This audit **cannot resolve this from repository evidence and does not guess.** Two readings are
possible and they have opposite consequences:

- If `bzzlhzgfvnnwxjxvpzdk` is production → every Class D and E risk in this document is live, and
  §5.1 has already occurred.
- If `bzzlhzgfvnnwxjxvpzdk` is a development project and `ldnrmgafsquzfitcuvxq` is production →
  the Class D suite has been running against a de-facto (undeclared, unguarded, unreset) test
  environment, and the exposure is far lower. **But the Class E scripts select their target by
  querying for live Xero tokens** — so if any development workspace holds real Xero credentials,
  §5.1 still applies regardless.

Note also that `.env.local` sets the URL **with a `/rest/v1/` suffix**, which `.env.example:12`
explicitly warns against. Every script strips it defensively
(`.replace(/\/rest\/v1\/?$/i, "")`) — 47 identical workarounds for one malformed configuration value.
The application itself may not be so forgiving.

**Action: confirm which project is production, and which Xero organisations are connected in
`bzzlhzgfvnnwxjxvpzdk`, before any other remediation.** Everything else in this document is
conditional on the answer.

### 4.3 Authentication

| Mode | Scripts | Notes |
|---|---|---|
| **Service role (`SUPABASE_SERVICE_ROLE_KEY`)** | **47** | **RLS bypassed in every case.** Tenant scoping is application-level only. |
| Anon key | **0** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` is referenced by no script. |
| Workspace user session (created by the script) | 34 | Real login through `/api/workspace/login`; cookies `vyron_cost_active_client` + `vyron_workspace_user_session` |
| Platform admin session | 1 | `test-companies-module-certification.mjs` via `/api/platform-auth/login`, cookie `vyron_platform_session` |
| **Hard-coded real session** | **2** | `tmp-preview-e2e.ps1:4`; `.tmp-fg-cert/certify-fg-export.mjs` via `cookies-test.txt` |
| None | 5 | Classes A and B |

**Zero scripts test the anon-key path.** RLS policy correctness is therefore entirely unverified by
this suite — an important blind spot, because RLS is the last line of defence when application-level
`company_id` filtering is wrong, and PAT §2.2 identifies exactly that circularity.

### 4.4 Database behaviour

Aggregate operation counts across all 54 assets:

| Operation | Scripts | Notes |
|---|---|---|
| Read only | 14 | Class C |
| Insert | 30 | |
| Update | 8 | |
| Delete | 27 | Overwhelmingly cleanup, not assertion |
| Upsert | 26 | Almost always `vyron_user_profiles` on `id` |
| Schema inspection | 14 | Class C |
| **Migration / DDL** | **0** | **No script alters schema.** All 46 `.sql` files under `supabase/` are applied by hand. |
| RPC | 1 | `tmp-live-constraint-proof.mjs` — capability probe only |

**Tables touched (61 distinct), by domain:**

- **Identity / tenancy:** `vyron_cost_companies`, `vyron_workspaces`, `vyron_workspace_memberships`, `vyron_user_profiles`, `vyron_platform_users`
- **Procurement:** `vyron_cost_suppliers`, `vyron_cost_purchase_orders`, `vyron_cost_purchase_order_lines`, `vyron_cost_goods_receipts`, `vyron_cost_goods_receipt_lines`, `vyron_cost_back_orders`, `vyron_cost_procurement_requisitions`, `vyron_cost_procurement_requisition_lines`, `vyron_procurement_audit_log`, `vyron_po_approval_rules`
- **Inventory:** `vyron_cost_stock_items`, `vyron_cost_stock_ledger`, `vyron_cost_stock_counts`, `vyron_cost_stock_count_lines`, `vyron_cost_inventory_transactions`, `vyron_inventory_audit_log`, `vyron_stock_movements`
- **Manufacturing:** `vyron_cost_boms`, `vyron_cost_bom_lines`, `vyron_cost_products`, `vyron_finished_goods`, `vyron_cost_ingredients`, `vyron_cost_production_runs`, `vyron_cost_production_run_lines`, `vyron_cost_production_labour`, `vyron_cost_production_overhead`, `vyron_cost_production_wastage`, `vyron_cost_production_audit_log`, `vyron_production_runs`, `vyron_production_run_audit`
- **Sales / customers:** `vyron_customers`, `vyron_customer_invoices`, `vyron_customer_invoice_lines`, `vyron_customer_sales_orders`, `vyron_customer_sales_order_lines`, `vyron_customer_sales_order_allocations`, `vyron_customer_sales_order_audit`, `vyron_customer_sales_order_invoice_links`, `vyron_customer_sales_order_production_links`, `vyron_customer_sales_order_requisition_links`, `vyron_cost_categories`
- **Stores / branches:** `vyron_cost_stores`, `vyron_cost_store_orders`, `vyron_cost_store_order_lines`, `vyron_cost_store_order_events`, `vyron_store_order_approval_rules`
- **Documents:** `vyron_documents`, `vyron_document_extraction_logs`
- **Integrations:** `vyron_xero_workspace_settings`, `vyron_xero_sync_queue`
- **AI metering:** `vyron_ai_usage_events`, `vyron_ai_company_allowances`

Note `vyron_documents` is scoped by **`tenant_id`**, not `company_id`
(`test-po-enterprise-hardening.mjs` cleanup) — an inconsistency in the tenancy column convention
that any generic PAT teardown must handle explicitly.

### 4.5 Storage behaviour

**Bucket in use:** `vyron-documents` (`src/lib/vyron-documents.ts:1`).

**No script calls `supabase.storage` directly** — verified across all 54. Storage is nevertheless
written, indirectly, by three assets that upload multipart files through the application:

| Script | Storage effect | Reversed? |
|---|---|---|
| `test-po-enterprise-hardening.mjs:227` | PO attachment → `vyron-documents` | **Partly.** An "Attachment Delete" assertion exercises the delete API. But the `finally` block removes `vyron_documents` **rows** directly via the service-role client — which cannot remove storage objects. Any run that fails before the API delete leaves an orphaned object with no database row referencing it. |
| `test-finished-goods-enterprise-phase8.mjs:493` | FG attachment → `vyron-documents` | **No.** `cleanupWorkspace` deletes only workspace and company rows. |
| `tmp-preview-e2e.ps1:52` | Invoice PDF → `vyron-documents` (deployed environment) | **No cleanup of any kind.** |

**There is no inventory of what is in the bucket, and no mechanism to reconcile storage against
`vyron_documents`.** PAT §2.6's requirement that storage reset atomically with the database has no
foundation to build on yet — the first step is a reconciliation script, which does not exist.

### 4.6 External services

| Service | Reached by | Detail |
|---|---|---|
| **Xero (live production API)** | **6** (Class E) | Both through the app (`/api/integrations/xero/*`) and **directly to `api.xero.com`** using the customer's stored OAuth token (`tmp-product-overrides-only-cert.mjs:129-135`) |
| **OpenAI** | **1** — `tmp-preview-e2e.ps1` | Via `/api/documents/{id}/extract`. OpenAI is reached **only** from `src/app/api/document-intelligence/extract/route.ts`, `src/app/api/documents/[id]/extract/route.ts` and `.../health/route.ts` — verified by source search. |
| **Email / webhooks** | **1** — `test-po-enterprise-hardening.mjs` | "Email Engine" / "Email History" assertions via the PO email path. Destination unverified — see §5.4. |
| **Vercel** | **1** — `tmp-preview-e2e.ps1` | `npx vercel curl` against a deployed preview |

**Important clarification.** `/api/cost-ai-insights` and `/api/demand-forecast` — exercised by
`test-intelligence-modules-certification.mjs` — **do not call OpenAI.** Source inspection confirms
no OpenAI import in those routes. Those endpoints are deterministic computation, so that script
incurs **no AI spend and no non-determinism from the provider.** This makes it a better PAT
candidate than its name suggests.

**Consequence:** the AI extraction pipeline — the subsystem PAT §2.8 devotes most design attention
to — has **exactly one validation asset, and it does not run.**

---

## 5. Risk assessment

### 5.1 CRITICAL — Live-tenant hijack and irreversible third-party writes

**Assets:** the six Class E scripts.
**Classification: UNSAFE AGAINST PRODUCTION.**

**What happens on execution.** The script selects a workspace *because* it has a live Xero
connection, inserts a fabricated user as its `OWNER`, authenticates as that user, and drives the
integration. Six categories of effect follow:

| # | Effect | Reversed by cleanup? |
|---|---|---|
| 1 | Fabricated `OWNER` membership in a real customer's workspace | Yes — deleted in `finally` |
| 2 | **`save-defaults`: company-wide Xero account mapping overwritten** with an arbitrarily selected revenue account (`pick(catalog, /revenue\|income\|otherincome/)`) | **No.** The prior value is never read, never stored, never restored. |
| 3 | `save-category` / `save-product` mapping writes, then **blanked** to test inheritance fallback | **No.** Categories created by the script are deleted; the *cleared* state of pre-existing mappings is not restored. |
| 4 | Products, customers, categories and invoices created under the **live `company_id`** | Mostly — deleted by id in `finally` |
| 5 | **Invoices pushed into the live Xero organisation.** `tmp-product-overrides-only-cert.mjs` calls `createInvoiceAndResolveAccount()` **three times**, each producing a real `xeroId`. `tmp-xero-integration-regression-probe.mjs` runs `sync-all-customers-now`, `sync-all-suppliers-now`, `sync-all-invoices-now`. | **No. Not reversible by any code in this repository.** |
| 6 | **OAuth refresh-token rotation** (`refresh-token`, `tmp-xero-integration-regression-probe.mjs:79`) | **No.** Xero refresh tokens are single-use and rotate; a failure to persist the new token breaks the customer's connection. |

The cleanup blocks are diligent about local rows — `tmp-product-overrides-only-cert.mjs` has 12
distinct teardown statements — which makes the omission easy to miss on review: **the code looks
thorough precisely where it is complete, and is silent where it cannot act.**

**Aggravating factors.**
- `tmp-product-overrides-only-cert.mjs:117-135` reads the customer's OAuth **access token out of the
  database** and calls `https://api.xero.com/api.xro/2.0/Invoices/{id}` directly. This bypasses the
  application's permission layer, its audit logging, and its rate limiting entirely.
- `tmp-xero-live-target-check.mjs` exists solely to **enumerate which customers have live Xero
  connections**. As a standalone artefact it is a target list.
- These scripts are named `tmp-*`, which reads as disposable, and are `git`-tracked, which means
  they are permanent and reachable by anyone who clones the repository.

**Severity: Critical under any reading of §4.2.** Even if `bzzlhzgfvnnwxjxvpzdk` is a development
project, these scripts locate their target by querying for *live Xero credentials* — so the presence
of any real Xero connection in that project reproduces the full effect.

**Required action — today, before anything else:**
1. Establish whether any of these six has been executed against a workspace with a live Xero
   connection, and against which Xero organisation.
2. If so: reconcile the Xero organisation's invoice ledger for entries created by these runs, and
   verify the customer's Xero default account mapping is correct.
3. Render all six non-executable (§7.1).

### 5.2 CRITICAL — Committed session credentials and third-party identifiable data

**`scripts/tmp-preview-e2e.ps1:4`** contains a hard-coded `Cookie` header holding decoded values:

- `vyron_workspace_user_session` — real user id, real email address (`precisionaccounting@gmail.com`),
  first name, surname, role `OWNER`
- `vyron_cost_active_client` — real workspace id, real company id, company name
  ("Northwood Management Investment"), trading name ("Cutting Edge Cuisine"), package, contact
  email, phone number, and **`"impersonating":true`**

**`cookies-test.txt`** (repository root, **git-tracked**) is a Netscape-format cookie file holding
the same two cookie names for `localhost`, with expiry `1782312499`. Its contents were **not decoded
during this audit**; the classification rests on the file being tracked, on its cookie names, and on
the application's own cookie contract as evidenced by the decoded example above. It is consumed by
`.tmp-fg-cert/certify-fg-export.mjs` (`parseCookieFile`).

**Why this is critical regardless of expiry.** These are in git history, so removing the files does
not remove the credentials. They carry third-party commercial identity — a customer's company name,
trading name, contact details and internal identifiers — which PAT §4 explicitly prohibits from
entering the repository. `"impersonating":true` indicates the session was created through the
platform-admin impersonation path, which is the most privileged session type the product issues.

**Required action:**
1. Treat both as compromised. Confirm the sessions are invalid; rotate if there is any doubt.
2. Remove from tracking and add to `.gitignore`. Decide separately, with the customer's interests in
   view, whether history rewrite is warranted for the PII.
3. `.tmp-fg-cert/certify-fg-export.mjs` must take a cookie file path as an argument, never a
   committed default.

### 5.3 HIGH — Unbounded, silent accumulation in a shared database

Established in §3.4.2. Combined effect of the seven no-cleanup scripts, the eight partial-cleanup
scripts, and `finally` blocks that do not run on interrupt:

- Orphan tenants and `auth.users` accumulate with every run and every interrupted run.
- Orphan child rows (production runs, stock ledger entries, products, BOMs) survive their parent
  company and are invisible to tenant-scoped queries.
- Orphan storage objects accumulate in `vyron-documents` with no referencing row.
- **A `PLATFORM_ADMIN` can survive** if the auth-user table exceeds the 2,000-user cleanup ceiling
  (§3.4.2c).

**No inventory of this residue exists.** Producing one — count of `vyron_cost_companies` rows
matching the test-tenant naming patterns (`Perm Co %`, `Proc Test %`, `Archive Test %`,
`Invoice Stock Test %`, `Recipes Test %`, `Selector Test %`, `Probe %`, `CHK PROBE %`,
`Intelligence Cert %`, `Companies Cert %`) and the corresponding `auth.users` and
`vyron_platform_users` rows — is a read-only query and is the first task of Phase 1.

### 5.4 MEDIUM — Unverified email destinations

`test-po-enterprise-hardening.mjs` asserts "Email Engine" and "Email History". The audit did not
establish where those emails are delivered — whether to a webhook sink (`VYRON_EMAIL_WEBHOOK_URL`),
to a `@example.com` address that bounces, or to the supplier address recorded on the PO. The PO in
question is created by the script with an `@example.com` supplier, which suggests the former, **but
this was not confirmed by reading the email path in application source and must not be assumed.**
PAT §2.9 requires a capture sink; until the current destination is verified, treat this script as
capable of sending mail.

### 5.5 MEDIUM — Codemods that rewrite production source remain executable

Established in §3.1. `apply-api-permission-guards.mjs` rewrites 43 named route files by regex.
Its companion exists only because it got that wrong once. Neither has post-condition assertions.
The undeclared `glob` dependency means one is already latently broken.

### 5.6 LOW — Schema verification is structurally incomplete

Established in §3.3. Index, foreign-key, view and function verification is impossible through
PostgREST in this deployment, and two scripts query interfaces that do not answer. Schema
verification is limited to tables and columns. PAT §2.5's parity requirement cannot be fully met by
current tooling, and the drift check should not be described as complete.

### 5.7 Risk summary

| Classification | Count | Assets |
|---|---|---|
| **UNSAFE AGAINST PRODUCTION** | **7** | 6 × Class E, plus `tmp-preview-e2e.ps1` |
| **HIGH RISK** | **7** | The seven no-cleanup Class D scripts |
| **MEDIUM RISK** | **11** | 8 partial-cleanup Class D, 2 codemods, `.tmp-fg-cert/certify-fg-export.mjs` |
| **LOW RISK** | **11** | Complete-cleanup Class D scripts |
| **SAFE** | **18** | 14 × Class C, 3 × Class B, `tmp-run-marker.ps1` |

---

## 6. PAT readiness

| Disposition | Count | Assets |
|---|---|---|
| **Ready for PAT** | **3** | `validate-schema-drift.mjs` (→ PAT precondition, per PAT §2.5) · `visual-capture.mjs` (→ Gate 4 capture stage) · `deployment-verification-remaining-modules.mjs` (→ provisioning verification) |
| **Ready after configuration** | **11** | The 11 complete-cleanup Class D scripts. They need: the fail-closed guard, `.env.pat`, fixed seed identities in place of `Date.now()`, and a runner. Their **logic is sound and their teardown is honest.** |
| **Requires refactoring** | **19** | 8 partial-cleanup Class D (teardown must be completed) · 7 no-cleanup Class D (teardown must be written) · `.tmp-fg-cert/certify-fg-export.mjs` (cookie handling) · `verify-sales-order-schema-runtime.mjs` + 2 further probes (fold into the drift checker) |
| **Replace entirely** | **6** | All six Class E scripts. Their *intent* — proving Xero mapping precedence and sync correctness — is legitimate and valuable. Their *method* is not correctable by patching; they must be rebuilt against a Xero **demo company** with separate credentials, per PAT §2.9. |
| **Retire** | **15** | 8 overlapping read-only schema probes (superseded by a consolidated drift checker) · `verify-sales-order-schema.mjs` and `tmp-check-product-financial-columns.mjs` (query blocked interfaces) · `tmp-migration-history-probe.mjs`, `tmp-meta-probe.cjs`, `tmp-live-constraint-proof.mjs` (one-time discovery questions — **record the answers first**) · `tmp-run-marker.ps1` · `tmp-preview-e2e.ps1` (**purge, do not merely retire** — §5.2) |

**Not in scope for disposition:** `generate-pwa-icons.mjs`, `import-handcrafted.mjs`,
`apply-api-permission-guards.mjs`, `fix-api-guard-placement.mjs` — these are build/data/refactoring
tooling, not validation assets. They should move to `tools/` so `scripts/` means one thing.

### 6.1 Readiness verdict

The PAT Architecture's Phase P1 states that migrating the existing scripts onto a guard is
"remediation, not improvement", and that judgement holds. This audit adds three qualifications:

1. **P1 must be preceded by P0: resolve §4.2 and quarantine Class E.** Pointing the Class E scripts
   at a PAT database does not make them safe — they select their target by querying for live Xero
   tokens, and the harm is to the *external* system. A guard on the Supabase host does not close
   this.
2. **The guard alone is insufficient for 15 scripts.** Redirecting a leaking script to PAT converts
   an unbounded production leak into an unbounded PAT leak. PAT §3.3's reset makes that survivable,
   but reset (P2) then becomes a P1 dependency rather than a follow-on.
3. **The suite is more valuable than expected.** 11 scripts are close to PAT-ready and cover
   procurement, permissions, roles, user management, companies, warehouses and exports at genuine
   depth. **The correct posture is preservation, not replacement.**

---

## 7. Coverage matrix

Legend: **Strong** — multiple assertions incl. negative paths · **Partial** — happy path only, or
one script · **None** — no asset.

| Area | Coverage | Assets | Assessment |
|---|---|---|---|
| **Authentication** | **Partial** | `test-manage-login`, `test-roles-permissions` (401 on unauthenticated), all 34 session-driving scripts | Login provisioning and the 401 path are covered. **No test of invalid credentials, session expiry, or logout.** PAT-AUTH-002/003/004 uncovered. |
| **Permissions / authorisation** | **Strong** | `test-permissions`, `test-roles-permissions`, `test-user-management`, `test-uom`, `test-pdf-export`, `test-companies` | The best-covered area. Grant/revoke with re-login, 403 denial, **privilege-escalation denial**, cross-tenant isolation, unauthenticated 401. Directly satisfies PAT-AUTHZ-001/002/004/005/007. |
| **Suppliers** | **Partial** | `test-procurement-critical-workflow`, `test-branches-warehouses`, `test-master-data-integrity-audit` | Created as workflow fixtures. **No supplier CRUD or import coverage.** |
| **Products / master data** | **Strong** | `test-master-data-integrity-audit`, `test-finished-goods-*`, `test-uom` | CRUD, archive/restore, referential guards, cross-module propagation of master-data flags. |
| **Inventory** | **Strong** | `test-invoice-stock`, `tmp-runtime-failure-probe`, `test-branches-warehouses`, `tmp-customer-invoice-*` | Opening stock, idempotency, sale posting/reversal, ledger assertions, adjustments with audit. **Genuinely good.** |
| **Manufacturing** | **Strong** | `test-manufacturing-lifecycle-enterprise`, `test-finished-goods-enterprise-phase8`, `test-recipes-api` | Full run lifecycle create→start→complete→approve→reverse, cost roll-up, consumption, audit trail. |
| **Procurement** | **Strong** | `test-procurement-critical-workflow`, `test-po-enterprise-hardening` | Requisition→PO→GRN→back-order, approval/reject/archive/restore, discount recalculation, PDF, attachments. |
| **Sales orders** | **Partial** | `test-customer-sales-orders-workflow` | One script, no cleanup, links tables only. |
| **Customers** | **Partial** | `test-customer-selector`, `tmp-customer-balance-statement-check`, `tmp-customer-invoice-*` | Invoicing and balances covered; **customer CRUD is not.** |
| **Documents / AI extraction** | **None (effectively)** | `tmp-preview-e2e.ps1` only | The single asset is unrunnable (hard-coded foreign paths) and compromised. **The entire PAT-EXTRACT catalogue — 17 tests — has no foundation.** |
| **Reporting / exports** | **Strong** | `test-pdf-export-module-certification`, `.tmp-fg-cert/certify-fg-export.mjs` | PDF and Excel/CSV exports, permission gating, tenant isolation, date filters, unknown-report handling, empty states. |
| **Administration** | **Strong** | `test-companies`, `test-user-management`, `test-client-archive` | Company lifecycle, platform-admin flows, workspace archive/delete, user management. |
| **Security** | **Partial** | `test-roles-permissions`, `test-companies`, `test-pdf-export`, `tmp-live-constraint-proof` | Privilege escalation, cross-tenant reads and data-leakage assertions exist. **No SQL injection, no XSS, no upload type/size enforcement, no secrets-in-bundle check, no rate limiting, no RLS verification** (§4.3). |
| **Deployment / schema** | **Strong (within limits)** | `validate-schema-drift`, `deployment-verification-remaining-modules`, 12 probes | Table and column parity across 21 modules. **Indexes, FKs, views and functions cannot be verified** (§5.6). |
| **Performance** | **None** | — | No timing assertion anywhere. |
| **Regression** | **None** | — | No baseline, no historical result store, no trend. Named scripts are point-in-time certifications. |
| **Visual / UX** | **Partial** | `visual-capture.mjs` | 13 routes × 3 viewports captured with console-error and redirect reporting. **No diffing, no committed baselines**, and tablet/phone captures are viewport-clipped (§3.2). |
| **Imports (CSV/Excel)** | **None** | — | `.tmp-fg-cert/` fixtures cover **export**, not import. **The entire PAT-IMPORT catalogue — 11 tests — has no coverage.** |
| **Error handling** | **Partial** | `tmp-runtime-failure-probe`, `tmp-status-check-behavior` | Two targeted probes. No network-failure, DB-unavailable, AI-provider-down, or concurrent-edit coverage. |

### 7.1 Unnecessary overlap

| Overlap | Assets | Recommendation |
|---|---|---|
| Schema/column probing | 8 scripts implementing one primitive with different table lists | Collapse into `validate-schema-drift.mjs` + per-module table manifests |
| Xero mapping precedence | `tmp-invoice-export-mapping-cert.ts`, `tmp-product-overrides-runtime-cert.ts`, `tmp-product-overrides-only-cert.mjs` — three scripts, near-identical precedence assertion (product → category → company default) | One test in the rebuilt Xero suite |
| Chart-of-accounts sync | `tmp-enterprise-financial-certification.mjs` is a strict subset of `tmp-enterprise-financial-full-certification.mjs` | Delete the subset |
| Customer invoice validation | `tmp-customer-invoice-validation.mjs`, `tmp-customer-invoice-production-check.mjs`, `tmp-deployment-verification.mjs` overlap heavily on invoice→stock→ledger | Consolidate to one |
| Deployment verification | `tmp-deployment-verification.mjs` (writes) vs `deployment-verification-remaining-modules.mjs` (read-only) — same name, different scripts, different risk | Rename both; keep the read-only one as the deployment gate |

---

## 8. Gap analysis against the Product Gap Register

`docs/PRODUCT-GAP-REGISTER.md` exists on branch `docs/product-gap-register` and **is not present in
this working tree.** The following is therefore based on the register entries cited in
`docs/PAT-ARCHITECTURE.md` §7 — GAP-001 and GAP-002 (supplier imports) and GAP-003 (error handling)
— and **must be re-verified against the register itself once that branch is available.**

### 8.1 Existing scripts that already validate known gaps

- **GAP-003 (error handling)** — partially validated. `tmp-runtime-failure-probe.mjs` is a purpose-built
  reproduction of an inventory-adjustment failure, capturing status, body, before/after quantity and
  the audit log. `tmp-status-check-behavior.mjs` enumerates which `status` values the
  `vyron_customer_invoices` CHECK constraint accepts. **Both are genuine gap-validation assets and
  should be promoted to PAT-ERR tests rather than retired.**

### 8.2 Missing validation

- **GAP-001 / GAP-002 (supplier imports)** — **no coverage at all.** No script imports a CSV or
  Excel file. Suppliers are only ever created individually as workflow fixtures. The 15 import
  fixtures PAT §4.1 specifies do not exist. This is the largest single gap between the catalogue and
  reality, and it blocks 11 PAT-IMPORT tests.
- **Document extraction** — as §7. One unrunnable script for 17 catalogue tests.

### 8.3 Duplicate validation

Per §7.1 — the schema probes and the Xero mapping trio are the two material duplications. Both are
symptoms of the same cause: **no discoverable index of what already exists**, so each new question
produced a new script rather than an extension of an existing one.

### 8.4 High-risk blind spots

Ordered by severity of what could ship undetected:

1. **Imports** — the primary bulk data-entry path, entirely unvalidated. Partial-failure and
   rollback behaviour (PAT-IMPORT-007) is untested, and that is a data-corruption class.
2. **Document extraction** — the product's most differentiated capability, with one unrunnable test.
3. **RLS policies** — zero anon-key coverage (§4.3). The last line of defence against the
   cross-tenant write that PAT §2.2 calls the highest-severity risk in the catalogue is unverified.
4. **Cross-tenant *write*** (PAT-AUTHZ-006) — cross-tenant *reads* are tested in six scripts; the
   write path is not tested anywhere.
5. **File upload validation** — type, size and content-type-mismatch enforcement untested, despite
   upload paths being exercised by two scripts.
6. **Visual regression** — capture without diffing. As PAT §5 records, this is how the
   semantic-colour and dark-page defects survived multiple ELD passes.
7. **Concurrency** — no test runs two sessions against the same record.
8. **Performance** — no timing assertion anywhere; no baseline from which a threshold could be set.

---

## 9. Immediate safeguards — no code changes required

Ordered by risk closed per unit of effort. Items 1–4 are executable today.

**1. Resolve the environment question (§4.2).** Confirm which Supabase project is production, and
enumerate the Xero connections present in `bzzlhzgfvnnwxjxvpzdk`. Record the answer in this document.
*Everything below is prioritised by that answer.* — **minutes**

**2. Quarantine Class E by file permission.** Do not edit them. Mark the six scripts read-only /
non-executable at the filesystem level, and record in `scripts/README.md` that they are prohibited
pending rebuild. This is reversible, requires no code change, and closes the critical risk today.
— **minutes**

**3. Treat the two committed credentials as compromised (§5.2).** Confirm the sessions are invalid,
rotate if in doubt, and add `cookies-test.txt` and `scripts/tmp-preview-e2e.ps1` to `.gitignore`.
— **within the hour**

**4. Take a residue inventory (§5.3).** A read-only query counting test-pattern tenants,
orphaned `auth.users` and any surviving `vyron_platform_users` rows. This sizes the leakage problem
before any cleanup is attempted. — **within the hour**

**5. Write `scripts/README.md`** — the single highest-value zero-code artefact. It should carry, per
script: what it does, which environment it expects, whether it writes, whether it cleans up, and
whether it is currently permitted to run. **The absence of this file is the direct cause of the
duplication in §7.1** — nobody could see what already existed. — **half a day**

**6. Adopt an execution policy** and state it in `AGENTS.md`: no script under `scripts/` may be run
against any environment until it declares its target and has been reviewed; Class E is prohibited
outright.

**7. Rename to make risk visible in the file listing.** `tmp-` currently communicates "disposable"
about files that are permanent and, in six cases, dangerous. A prefix that encodes write behaviour
— `probe-` (read-only), `cert-` (ephemeral tenant), `unsafe-` (live tenant) — makes the risk legible
at `ls` time. **Deliberately deferred to Phase 1** so it does not obscure the quarantine diff.

**8. Record the answers before retiring the discovery probes.** `tmp-live-constraint-proof.mjs`,
`tmp-meta-probe.cjs` and `tmp-migration-history-probe.mjs` each answer a one-time question. Capture
the answers — particularly whether `run_sql`/`exec_sql` are exposed (§3.3) — in this document, then
retire the scripts.

---

## 10. Implementation roadmap

### Phase 0 — Contain (immediately, before P1)

*Not in the original phasing. This audit's finding that Class E writes irreversibly to a live
third-party accounting system makes containment a prerequisite, not a first step.*

- Resolve §4.2.
- Quarantine the six Class E scripts.
- Assess Xero exposure: whether these scripts have run against a live organisation, and reconcile
  if so.
- Rotate the two committed credentials.
- Take the residue inventory.

**Exit criterion:** no asset in the repository is capable of writing to a live customer's external
accounting system.

### Phase 1 — Protect existing scripts

- `scripts/README.md` with the full classification (§3).
- Execution policy in `AGENTS.md`.
- Rename by risk class.
- Move `apply-api-permission-guards.mjs`, `fix-api-guard-placement.mjs`, `generate-pwa-icons.mjs`
  and `import-handcrafted.mjs` to `tools/`.
- Declare the missing `glob` dependency, or delete the codemods.
- Add `cookies-test.txt`, `deployment-gap-report.json` and `.tmp-fg-cert/` output to `.gitignore`;
  keep the `.tmp-fg-cert/` **fixtures** tracked and relocate them to `pat/assets/`.
- Record the discovery-probe answers, then retire those probes.

**Exit criterion:** every asset is documented, correctly located, and its risk visible from its name.

### Phase 2 — Convert suitable scripts into PAT assets

- Provision the `vyron-pat` Supabase project; `.env.pat`; `VYRON_ENV` (PAT §2.3).
- Build `scripts/pat/guard.mjs` — fail-closed, host allowlist, non-bypassable.
- **Extract the shared preamble.** The `.env.local` parse + `createClient` block is duplicated 47
  times. Replacing it with one guarded module is a single mechanical change that puts the guard in
  front of every script at once, and is the highest-leverage change in the programme.
- Migrate the 11 "ready after configuration" scripts first.
- Complete teardown for the 8 partial-cleanup scripts; write teardown for the 7 that have none.
  `test-branches-warehouses-module-certification.mjs`'s `cleanupWorkspace` is the reference.
- Consolidate the 8 schema probes into `validate-schema-drift.mjs` + table manifests.

**Exit criterion:** no script can reach a non-PAT database, and every script that writes also
removes what it wrote.

### Phase 3 — Reusable test framework

- Deterministic seed with fixed UUIDs and fixed dates (PAT §3.1), replacing `Date.now()` fixtures.
- Reset capability, database **and** storage (PAT §3.3) — including a `vyron-documents`
  reconciliation, which does not exist today (§4.5).
- **Adopt the `{module, runtimeStep, rootCause, exactFile, smallestFix}` diagnostic schema** from
  the `tmp-*-cert` family as the standard failure format.
- Standardise on accumulate-then-report; eliminate fail-fast masking (§3.4.2e).
- Fixed PAT identity matrix (PAT §2.4), replacing per-run user creation.
- Validation assets (PAT §4), starting with the supplier import fixtures — **the largest gap** (§8.2).
- Rebuild the Xero suite against a **demo company**, consolidating the three duplicate precedence
  tests into one (§7.1).

**Exit criterion:** a new test is written by declaring a case, not by copying 40 lines of preamble.

### Phase 4 — Automated execution

- Test runner; the PAT catalogue (PAT §5) as the registry.
- Drift check as a hard precondition — abort, do not warn (PAT §2.5).
- Baseline diffing on `visual-capture.mjs`; fix the tablet/phone `fullPage` asymmetry (§3.2) before
  approving baselines.
- Structured per-run results with run id, commit SHA, seed version and durations — the prerequisite
  for any regression capability, which is currently **None** (§7).
- Close the highest-severity blind spots: PAT-AUTHZ-006 (cross-tenant write), RLS verification via
  the anon key, upload type/size enforcement.

**Exit criterion:** one command runs the suite against a reset PAT and produces a retained evidence
bundle.

### Phase 5 — CI

- Gates 1–4 on every PR; Gate 5 on release.
- Live-mode AI accuracy runs as a tracked metric, never a gate (PAT §2.8).
- Performance corpus and thresholds derived from measurement (PAT §3.2, §5).

**Exit criterion:** no gate depends on someone remembering.

---

## 11. Engineering observations

**1. This is not an absence of testing. It is an absence of infrastructure.**
54 assets, ~13,500 lines of validation code, covering procurement, manufacturing, inventory,
permissions, exports and administration at real depth — through real HTTP routes, asserting on real
database state. The engineering instinct here is sound. What is missing is everything *around* the
tests: isolation, determinism, teardown discipline, a runner, and a way to find out what already
exists. **The correct posture is preservation and completion, not replacement.**

**2. The `tmp-` prefix is the most expensive naming decision in the repository.**
It signals disposable. It is applied to 24 permanent, git-tracked files, six of which write to a
live customer's accounting system. Reviewers discount anything named `tmp-`; that is precisely why
the Class E family went uncharacterised through prior investigations. **Names are a control surface.**

**3. Teardown thoroughness and teardown correctness are different properties, and the gap between
them is where the risk lives.**
`tmp-product-overrides-only-cert.mjs` has twelve teardown statements. It is meticulous about
everything it *can* undo, and silent about the three invoices it pushed into a live Xero
organisation, which it cannot. A reviewer skimming that `finally` block sees diligence. **The
question to ask of a cleanup block is not "is it thorough?" but "what did the script do that no
cleanup block could reverse?"**

**4. Copy-paste created a 47-fold duplication that is now a 47-fold opportunity.**
The same 10-line `.env.local` parser appears in 47 files. It is the reason no script has a guard,
because there is no single place to put one. It is *also* the reason the guard is cheap: one shared
module, imported 47 times, and every script becomes fail-closed simultaneously. **The duplication
that created the problem makes the fix mechanical.**

**5. Cleanup that runs only in `finally` protects against the failure mode that matters least.**
`finally` handles thrown exceptions. It does not handle `Ctrl-C`, `process.exit()` inside the try,
laptop sleep, or a dropped connection — and those are the common ways a long-running certification
script ends. Several scripts call `process.exit()` inside their try block, guaranteeing the
`finally` is skipped on exactly the paths where cleanup matters. **PAT §3.3's insistence on reset
*before* each run, not cleanup after, is correct and this evidence strengthens it.**

**6. The suite's blind spots are not random — they follow the shape of the tooling.**
Everything reachable through a JSON API route is well covered. Everything that is not — file
imports, multipart uploads, RLS behaviour under a non-service-role key, rendering, timing — is
uncovered. **The tests cover what was easy to reach from Node with a service-role key**, and that
boundary explains the coverage map more completely than any judgement about priorities does. PAT's
value is that it makes the hard-to-reach paths reachable.

**7. A test suite that authenticates as a service role cannot test authorisation.**
47 scripts hold a key that bypasses RLS. The permission tests are meaningful because they *also*
create a real session and drive the HTTP API — but the setup, assertions and teardown all run with
RLS off. **The suite can prove the application's permission checks work. It cannot prove the
database's do.** For a multi-tenant product that is the more important of the two, and it is
currently unverified.

**8. Prior conclusions were wrong in a specific and instructive way.**
The ELD programme concluded "there is no automated test suite" from `package.json` containing no
test runner. That inference was locally valid and globally wrong — 51 of 54 assets are simply not
registered anywhere a tool would look. The PAT Architecture corrected it. This audit corrects the
correction: the risk was characterised as *writing to a live customer tenant*, and the more severe
truth is *writing irreversibly to a live customer's external accounting system.* **Each pass found
the previous framing too narrow, because each looked at a different artefact.** The pattern to note
is that all three conclusions came from reading *fewer files than the question required* — which is
the argument for this audit's method, and the reason its own limitations are stated below.

---

## 12. Limitations of this audit

Stated so they are not later mistaken for findings.

1. **The production environment question is unresolved (§4.2)** and cannot be resolved from
   repository contents. Every risk rating is conditional on it.
2. **No script was executed.** All behavioural claims are from source reading. Claims about what a
   script *would* do are inferences from its code, not observations.
3. **`cookies-test.txt` was not decoded.** Its classification rests on tracking status, cookie names,
   and the application's cookie contract as evidenced elsewhere (§5.2).
4. **Sampling is declared where it occurred.** Nine files over 380 lines —
   `test-branches-warehouses-module-certification.mjs` (705), `import-handcrafted.mjs` (717),
   `deployment-verification-remaining-modules.mjs` (608),
   `test-finished-goods-enterprise-phase8.mjs` (603), `tmp-deployment-verification.mjs` (601),
   `tmp-enterprise-financial-full-certification.mjs` (586),
   `test-manufacturing-lifecycle-enterprise.mjs` (476),
   `test-customer-sales-orders-workflow.mjs` (417),
   `test-companies-module-certification.mjs` (407) — were read in full at the head, credential
   resolution, tenant construction and cleanup, with targeted reads of the assertion body and
   mechanical extraction of all table references and assertion labels. **Their classification
   (environment, auth, DB behaviour, tables, cleanup integrity, risk) is fully evidenced. Their
   assertion inventories in §7 may be incomplete.**
5. **The Product Gap Register was not read** — it is on an unmerged branch (§8). The gap analysis
   rests on the register entries cited in the PAT Architecture and must be re-verified.
6. **Email destinations were not traced into application source (§5.4).** That script is classified
   conservatively as a result.
7. **Whether the Class E scripts have actually been executed against a live Xero organisation is
   unknown.** The repository shows capability and intent, not an execution log. Establishing this is
   Phase 0's first task.
8. **`apps/vyron-ops-mobile` was not audited.** It has its own `typecheck` script in `package.json`
   and may contain further validation assets.

---

*Audit complete. No production code, scripts, branches or commits were modified. This document is
untracked, as directed.*
