# VYRON — Repository Safety Programme (RSP)
## Phase 0 — Repository Safety Hardening Plan

**Status:** Architecture, governance and planning artefact. **Nothing in this document is implemented.**
**Authority:** Supersedes `docs/PAT-ARCHITECTURE.md` §8 phasing. Does not supersede its design content.
**Evidence base:** `docs/TEST-INFRASTRUCTURE-AUDIT.md` (54 assets inspected), plus the targeted source
verification recorded in §13.
**Scope:** Every executable validation asset in every VYRON repository. VYRON COST is the reference
implementation.

---

## 0. How to read this document

Every material statement carries one of three labels. This is not decoration — the audit
demonstrated that conclusions drawn from too few artefacts were repeatedly and confidently wrong
(`TEST-INFRASTRUCTURE-AUDIT.md` §11.8), and the discipline that catches that is labelling what you
actually know.

| Label | Meaning |
|---|---|
| **[VERIFIED]** | Established by direct inspection of a named file. A path and, where useful, a line number is given. |
| **[INFERRED]** | A reasoned conclusion from verified facts. The reasoning is shown so it can be challenged. |
| **[UNKNOWN]** | Not established by repository evidence. Stated as a question, never resolved by assumption. |

Design proposals are labelled **[TO BUILD]**. No capability is described in the present tense unless
it exists today.

### Mapping to the required Final Report

| Required section | Location |
|---|---|
| Executive Summary | Part 1 |
| Repository Risk Assessment | Part 2 §2.1 |
| Safety Classification Model | Part 2 |
| Environment Model | Part 3, Part 4 |
| Authentication Model | Part 6 |
| External Integration Strategy | Part 5 |
| Cleanup Standard | Part 7 |
| Credential Governance | Part 8 |
| Repository Safety Gates | Part 9 |
| Engineering Checklist | Part 10 |
| Product Relationship Diagram | Part 11 |
| Implementation Roadmap | Part 12 |
| Remaining Unknowns | Part 13 |
| Executive Recommendations | Part 14 |

---

# PART 1 — Executive Summary

## 1.1 Why this programme is required

The Test Infrastructure Audit inspected 54 executable validation assets. It established three facts
that, taken together, mean the repository cannot safely support additional testing infrastructure
until it is hardened.

**Fact 1 — No validation asset can determine which environment it is connected to. [VERIFIED]**

All 47 database-touching assets (46 under `scripts/`, plus `.tmp-fg-cert/certify-fg-export.mjs`)
load credentials by hand-parsing `.env.local`. The canonical form is
`scripts/validate-schema-drift.mjs:4-10`, replicated verbatim or near-verbatim across all 47. None
validates the resolved host. A repository-wide search for `VYRON_ENV` returns matches only in
`docs/PAT-ARCHITECTURE.md`.

The consequence is not that scripts point at the wrong environment — it is that **the concept of
"wrong environment" is not expressible in this codebase.** There is no value a script could read
that would tell it to stop.

**Fact 2 — Six assets mutate a system that no repository code can reverse. [VERIFIED]**

`tmp-enterprise-financial-certification.mjs`, `tmp-enterprise-financial-full-certification.mjs`,
`tmp-invoice-export-mapping-cert.ts`, `tmp-product-overrides-runtime-cert.ts`,
`tmp-product-overrides-only-cert.mjs` and `tmp-xero-integration-regression-probe.mjs` do not create
a sandbox. Each begins by querying `vyron_xero_workspace_settings` for a workspace with
`connected && accessToken && refreshToken && tenantId` — that is, **it selects its target because
the target is a real customer with a live accounting integration**
(`tmp-enterprise-financial-certification.mjs:80-83`). It then inserts a fabricated user as `OWNER`
of that workspace and drives real integration traffic: overwriting the company-wide Xero account
mapping via `save-defaults`, rotating the live OAuth refresh token, resynchronising the chart of
accounts, and pushing invoices into the live Xero organisation.
`tmp-product-overrides-only-cert.mjs:129-135` reads the customer's OAuth access token out of the
database and calls `https://api.xero.com/api.xro/2.0/Invoices/{id}` directly, bypassing the
application's permission layer, audit log and rate limiting entirely.

Their cleanup blocks are diligent — `tmp-product-overrides-only-cert.mjs` has twelve teardown
statements — and complete for local rows. **They are silent about the three Xero invoices the script
created, because no code in this repository can delete them.**

**Fact 3 — The one control that would have prevented this does not exist at any layer. [INFERRED]**

There is no runner, no CI, no execution policy, and no document describing what any script does.
`package.json` registers 3 of 54 assets. The other 51 are invoked by hand by whoever remembers them.
`TEST-INFRASTRUCTURE-AUDIT.md` §7.1 identified five separate cases of duplicated validation; the
inferred cause is that **no engineer could discover what already existed**, so each new question
produced a new script.

## 1.2 Why the PAT roadmap changed

`docs/PAT-ARCHITECTURE.md` §8 sequenced Phase P1 as: provision a PAT Supabase project, add
`VYRON_ENV`, build a fail-closed guard, and migrate the existing scripts onto it. That sequencing
rested on a premise the audit disproved.

**The premise:** the risk is that scripts write to a live customer *tenant*, and isolation by
credentials closes it. PAT §2.2 argues this well — a separate Supabase project makes isolation a
property of the credentials rather than of application logic, so it holds even when the code under
test is wrong.

**Why it does not hold here. [VERIFIED]** That argument is sound for every asset except the six in
Fact 2, and it fails for those in a specific way:

1. **The harm is external.** A guard on the Supabase host prevents the script reaching the
   production *database*. It does nothing about `api.xero.com`, which the script reaches over the
   public internet with a token it read from whatever database it did connect to.
2. **The target is selected, not configured.** These scripts do not read a workspace id from the
   environment. They *search* for one matching a predicate. Pointing them at a PAT database does not
   make them safe — it makes them search the PAT database. **If any workspace there holds a real
   Xero credential, the full effect reproduces.**
3. **Credential isolation is therefore not the boundary.** The boundary has to be at the
   *target-selection* layer, which is inside the script, not in its configuration.

**Second reason the sequencing changed. [INFERRED]** PAT P1 proposed migrating the existing scripts
onto the guard as a self-contained step, with reset arriving later in P2. The audit found 7 assets
with no cleanup at all and 8 with partial cleanup that orphans child rows
(`TEST-INFRASTRUCTURE-AUDIT.md` §3.4.1). Redirecting a leaking script to PAT converts an unbounded
production leak into an unbounded PAT leak. **Reset is therefore a dependency of P1, not a successor
to it** — which means P1 as scoped cannot be delivered independently.

## 1.3 Why repository safety now precedes PAT

PAT answers *"does the product behave correctly?"* RSP answers *"can our engineering tools cause
harm?"* These are different questions and the second is currently unanswered.

Three arguments for the ordering, each grounded in audit evidence:

**The tooling risk is live; the product risk is hypothetical.** PAT exists to catch defects before
customers meet them — valuable, and prospective. The six Xero assets are checked in, executable, and
require no defect to cause harm; they cause it by running as designed. **[UNKNOWN]** whether they
have been run against a live organisation — the repository shows capability and intent, not an
execution log (`TEST-INFRASTRUCTURE-AUDIT.md` §12.7). That uncertainty argues for urgency, not
delay.

**PAT would inherit the unsafe patterns.** PAT §8 P4 proposes consolidating the existing scripts
into a catalogue. Consolidating 26 scripts that each hand-parse `.env.local` and each implement
teardown differently would encode all three defects of Fact 1–3 into the new platform's foundation.
**The classification and standards in this document are the prerequisite for that consolidation
being an improvement rather than a migration of debt.**

**The blast radius is wider than one product. [VERIFIED]** `src/platform/products/registry.ts`
registers five products in this repository: `vyron_cost` (status `active`), and `vyron_core`,
`vyron_pay`, `vyron_farm`, `vyron_reach` (all status `planned`). VYRON CORE already has shipped
routes — `src/app/vyron-core/command-centre/page.tsx`, `src/app/api/vyron-core/command-centre/route.ts`
— despite its `planned` status. **[INFERRED]** These are modules within one repository sharing one
`.env.local` and one Supabase project, so a script written for one product operates with credentials
that reach all five. RSP is therefore not a standard to be ported to other repositories later; it
already governs five products today.

## 1.4 The one question that outranks the programme

**[UNKNOWN]** `.env.local` — parsed by all 47 assets — names Supabase project `bzzlhzgfvnnwxjxvpzdk`.
`.env.example:13-14` documents production as `ldnrmgafsquzfitcuvxq`.
`src/supabase/deploy/xero_deployment_baseline.sql:2` corroborates the latter as production.
`deployment-gap-report.json:26`, generated 2026-07-09, records the former as the connected database.
**Two distinct projects, both in recent use, and the repository does not establish which holds live
customer data.**

This document **does not resolve that uncertainty and is designed not to depend on it.** Every
control below is fail-closed: it denies execution when the environment is unproven, rather than
permitting it when the environment looks acceptable. That is a deliberate architectural response to
Part 4's brief — an environment that cannot be *proven* safe is treated as production.

---

# PART 2 — Repository Risk Classification

## 2.1 Repository Risk Assessment

The present state, from audit evidence:

| Risk | Assets | Severity | Status |
|---|---|---|---|
| Irreversible mutation of a customer's external accounting system | 6 | **CRITICAL** | Open, unmitigated |
| Live session credentials and third-party PII in version control | 2 | **CRITICAL** | Open, unmitigated |
| Unbounded accumulation of tenants, auth users and orphan rows | 15 | **HIGH** | Open, unquantified |
| Surviving `PLATFORM_ADMIN` past the 2,000-user cleanup ceiling | 1 | **HIGH** | Open |
| Orphaned storage objects in `vyron-documents` with no referencing row | 3 | **MEDIUM** | Open |
| Executable codemods that rewrite production source by regex | 2 | **MEDIUM** | Open |
| Schema verification structurally incomplete (no index/FK/view/function checks) | — | **LOW** | Open, accepted |

**[INFERRED]** The first two are the only ones capable of harming a party outside the engineering
team. They are therefore the only ones that justify emergency sequencing; the remainder are
correctable on a normal engineering cadence.

## 2.2 The classification model

Every executable validation asset **shall belong to exactly one family**. Two rules make the
assignment deterministic:

> **Rule 1 — Assignment is by maximum, not by purpose.**
> A script belongs to the highest-risk family for which it qualifies on *any* code path, including
> paths that execute only on failure. A script that reads 400 rows and writes one belongs to the
> family of the write.
>
> **Rule 2 — Family D is defined by reversibility, not by vendor.**
> Family D is *not* "scripts that call third parties". It is **scripts that mutate any system whose
> state cannot be restored by this repository's own database teardown.** This is a property, not a
> list, so it classifies correctly without needing to enumerate every integration in advance.

**[INFERRED]** Rule 2 matters more than it appears. Under a vendor list, the two attachment-upload
scripts would sit in Family C, because Supabase Storage is not a third party. Under the
reversibility test they are Family D, because `TEST-INFRASTRUCTURE-AUDIT.md` §4.5 establishes that
their `finally` blocks delete `vyron_documents` **rows** with the service-role client, which cannot
remove the storage object. The row disappears; the object remains, unreferenced and undiscoverable.
That is the Family D failure mode exactly, arriving through a first-party service.

---

## Family A — Read-only

**Risk: SAFE**

### Purpose
Establish facts about a database without changing it: schema parity, table and column existence,
row counts, capability probes.

### Characteristics
Inspection and queries only. No `insert`, `update`, `delete`, `upsert`, DDL, storage write, or
outbound call to any mutating endpoint.

### Membership [VERIFIED]
14 assets: `validate-schema-drift.mjs`, `deployment-verification-remaining-modules.mjs`,
`verify-sales-order-schema.mjs`, `verify-sales-order-schema-runtime.mjs`, `tmp-schema-probe.cjs`,
`tmp-schema-alignment-probe.cjs`, `tmp-column-exists-probe.cjs`, `tmp-manufacturing-audit.cjs`,
`tmp-inventory-foundation-audit.cjs`, `tmp-meta-probe.cjs`, `tmp-migration-history-probe.mjs`,
`tmp-check-product-financial-columns.mjs`, `tmp-live-constraint-proof.mjs`,
`tmp-xero-live-target-check.mjs`.

### Permitted environments
All, including Production.

### Authentication
Service role permitted, but **least privilege is required**: where a check can be performed with the
anon key it must be. **[INFERRED]** Today zero assets use `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(`TEST-INFRASTRUCTURE-AUDIT.md` §4.3), so every Family A asset reads with RLS disabled — unnecessary
for schema probes, which do not need row access at all.

### Execution rules
- Runnable on demand without approval.
- Output must not contain customer data. **[VERIFIED]** `tmp-xero-live-target-check.mjs:50` prints
  `workspaceId`, `tenantId` and `organisationName` for every connected workspace — customer
  identifiers written to a terminal and potentially a log. Family A assets must redact or aggregate.

### Approval
None.

### Standing exception — reconnaissance assets
**[VERIFIED]** `tmp-xero-live-target-check.mjs` is read-only and therefore Family A by the letter of
the definition. Its sole function is to enumerate which customers hold live Xero credentials, and
its output is the input the Family D scripts need. **As a standalone artefact it is a target list.**

> **Rule 3 — Reconnaissance escalation.** A read-only asset whose output materially enables a
> Family D operation is governed as Family D. Family membership follows consequence, not mechanism.

This is the only known instance. It is stated as a general rule because the pattern will recur.

---

## Family B — Ephemeral

**Risk: LOW**

### Purpose
Prove behaviour end-to-end by constructing a complete, isolated tenant, exercising it through the
real application, and removing it entirely.

### Characteristics
Creates only data it owns. Never reads or writes a pre-existing tenant's records. Cleanup is
**complete and verified** — Part 7 defines what that means and it is stricter than what any asset
achieves today.

### Membership [VERIFIED]
11 assets today meet the *completeness* bar though not yet the *verification* bar:
`test-branches-warehouses-module-certification.mjs` (29-table teardown in FK order — the reference
implementation), `test-procurement-critical-workflow.mjs`,
`test-user-management-module-certification.mjs`, `test-companies-module-certification.mjs`,
`test-pdf-export-module-certification.mjs`, `test-roles-permissions-module-certification.mjs`,
`test-intelligence-modules-certification.mjs`, `tmp-status-check-behavior.mjs`, and three further
complete-cleanup assets identified in `TEST-INFRASTRUCTURE-AUDIT.md` §3.4.1.

### Permitted environments
Development and PAT only. **Prohibited in Staging and Production.**

**[INFERRED]** This prohibition needs justifying, because a perfectly-cleaning script sounds
harmless anywhere. Three reasons it is not:
1. It creates real `auth.users` and real `PLATFORM_ADMIN` rows. Between creation and teardown these
   are live credentials in a live system.
2. `finally` does not run on `SIGINT`, on `process.exit()` inside the try block, or on host death.
   Several assets call `process.exit()` inside their try, guaranteeing the `finally` is skipped on
   exactly those paths (`TEST-INFRASTRUCTURE-AUDIT.md` §11.5). **Completeness of cleanup code is not
   completeness of cleanup.**
3. It writes through the live application, consuming the same rate limits, queues and audit trail as
   customer traffic.

### Authentication
Service role for setup and teardown; a workspace session created by the script for the assertions.
The session must belong to an identity the script created.

### Execution rules
- Must satisfy the Cleanup Standard (Part 7) in full, including the artefact ledger.
- Must register every created entity at the moment of creation, not at teardown.
- Must be re-runnable against a dirty environment without failing on residue from a prior run.

### Approval
None for Development. PAT execution requires a passing Environment Gate (Part 9).

---

## Family C — Persistent

**Risk: HIGH**

### Purpose
None legitimate. **Family C is a defect classification, not a design.** Membership means the asset
leaves data behind, whether by intent, by omission, or by an unhandled path.

### Characteristics
Any one of: creates data with no teardown; teardown that omits entities it created; teardown that
cannot run on the interrupt paths; or modification of a record the asset did not create.

### Membership [VERIFIED] — 15 assets
**No cleanup whatsoever (7):** `test-permissions.mjs`, `test-invoice-stock.mjs`,
`test-recipes-api.mjs`, `test-customer-selector.mjs`, `test-manage-login.mjs`,
`test-customer-sales-orders-workflow.mjs`, `test-client-archive.mjs` (cleans only by reaching its
final API call, past five `process.exit(1)` sites).

**Partial cleanup, orphaning child rows (8):** `test-manufacturing-lifecycle-enterprise.mjs`
(deletes workspace and company, orphaning production runs, run lines, audit log, products, stock
items, finished goods), `test-finished-goods-enterprise-phase8.mjs`,
`test-uom-module-certification.mjs`, `tmp-deployment-verification.mjs`,
`tmp-customer-invoice-production-check.mjs`, `tmp-customer-invoice-validation.mjs`,
`tmp-customer-balance-statement-check.mjs`, `tmp-runtime-failure-probe.mjs`.

### Permitted environments
**PAT only, and only where PAT reset (Part 7 §7.6) is operational.** Prohibited in Development,
Staging and Production.

**[INFERRED]** Prohibiting Family C in Development is deliberate and will be unpopular. The
justification is that Development shares `.env.local` with everything else, and the audit
established that no asset can tell the two apart. A shared, unresettable development database
accumulating orphan tenants is the state the audit found; permitting Family C there preserves it.

### Execution rules
- Every Family C asset carries a remediation owner and a target date for promotion to Family B.
- Family C is a **transitional** classification. An asset that remains Family C past its target date
  is retired, not extended.

### Approval
Named approver per execution, recorded. **[INFERRED]** This is intentionally burdensome. The
cheapest way out of the approval requirement is to fix the teardown, which is the outcome the
classification exists to produce.

### The specific hazard this family exists to surface [VERIFIED]
`test-companies-module-certification.mjs:75-84` upserts `vyron_platform_users` with
`role: "PLATFORM_ADMIN", is_active: true` — the highest privilege the product issues. Its cleanup
(`cleanupUserByEmail`, lines 164-179) resolves the user by scanning paginated
`auth.admin.listUsers`, capped at 10 pages × 200 = 2,000 users, and returns silently on any error.
**Beyond 2,000 auth users the cleanup fails silently and an active platform administrator
persists.** The script reports success. This is the archetypal Family C failure: teardown that
appears complete, is bounded by an invisible limit, and fails without signalling.

---

## Family D — External

**Risk: CRITICAL**

### Purpose
Prove integration behaviour against systems outside this repository's control.

### Characteristics (Rule 2)
Mutates any system whose state cannot be restored by this repository's database teardown:
Xero, OpenAI (metered spend), email delivery, outbound webhooks, and **Supabase Storage**.

### Membership [VERIFIED] — 10 assets
| Asset | Unreversible effect |
|---|---|
| `tmp-product-overrides-only-cert.mjs` | 3 real invoices per run pushed into the live Xero organisation; direct `api.xero.com` call with the customer's token |
| `tmp-xero-integration-regression-probe.mjs` | `refresh-token` (rotates the live OAuth refresh token); `sync-all-customers-now` / `-suppliers-now` / `-invoices-now` |
| `tmp-enterprise-financial-full-certification.mjs` | `select-organisation`; chart-of-accounts resync into the customer's company scope |
| `tmp-enterprise-financial-certification.mjs` | as above (a strict subset of the previous) |
| `tmp-invoice-export-mapping-cert.ts` | `save-defaults` — overwrites the company-wide Xero account mapping; never restored |
| `tmp-product-overrides-runtime-cert.ts` | `save-defaults`, `save-category`, `save-product` |
| `tmp-xero-live-target-check.mjs` | Family A by mechanism; Family D by Rule 3 |
| `tmp-preview-e2e.ps1` | OpenAI extraction spend; storage write to a deployed environment; hard-coded real session |
| `test-po-enterprise-hardening.mjs` | Storage object in `vyron-documents`; email dispatch (destination **[UNKNOWN]** — §13.4) |
| `test-finished-goods-enterprise-phase8.mjs` | Storage object in `vyron-documents`, never removed |

### Permitted environments
**PAT only**, and only against integration endpoints that are themselves non-production: a Xero
**demo company**, a captured email sink, replay-mode AI. Prohibited everywhere else, without
exception and without a bypass flag.

### Authentication
Integration credentials must be **provisioned for PAT and never shared with any other environment**.
A Family D asset must never read a credential it did not receive through explicit configuration.

**[VERIFIED]** This directly prohibits the current pattern. Six assets obtain their Xero credential
by querying `vyron_xero_workspace_settings` for whichever workspace has one. **Credential discovery
by database query is prohibited outright** — it is the mechanism by which a host-level guard is
defeated.

### Execution rules
1. Target must be **explicitly configured**, never discovered. A Family D asset that queries for its
   own target is non-compliant regardless of what it does afterwards.
2. Target must be verified against a committed allowlist of non-production identifiers immediately
   before the first outbound call.
3. Every outbound mutation is recorded to the artefact ledger **before it is issued**, so that a
   crash mid-operation leaves evidence of what was attempted.
4. Interactive confirmation naming the exact external target, unless running under a PAT-verified
   automated context.

### Approval
Named approver per execution, plus **pre-declared expected external side-effects**. If the asset
cannot state in advance what it will create in the external system, it is not ready to run.

---

## 2.3 Family summary

| | A — Read-only | B — Ephemeral | C — Persistent | D — External |
|---|---|---|---|---|
| Risk | SAFE | LOW | HIGH | CRITICAL |
| Assets today | 14 | 11 | 15 | 10 |
| Dev | ✅ | ✅ | ❌ | ❌ |
| PAT | ✅ | ✅ | ⚠ approval | ⚠ approval + allowlist |
| Staging | ✅ | ❌ | ❌ | ❌ |
| Production | ✅ redacted | ❌ | ❌ | ❌ |
| Approval | None | None | Per execution | Per execution + declared effects |
| Terminal state | Permanent | Permanent | **Transitional** | Permanent, tightly bounded |

**[VERIFIED]** 14 + 11 + 15 + 10 = 50. The remaining 4 of 54 are not validation assets and are
governed separately (Part 12 Phase 1): `generate-pwa-icons.mjs` and `import-handcrafted.mjs` (build
and data tooling), `apply-api-permission-guards.mjs` and `fix-api-guard-placement.mjs` (source
codemods). `tmp-run-marker.ps1` is dead and counted in Family A.

---

# PART 3 — Environment Classification

## 3.1 The five environments

**[VERIFIED]** Today only two of these five exist. Development and Production are evidenced by the
two Supabase project references in §1.4. **[UNKNOWN]** which reference maps to which. PAT and
Staging do not exist. "Unknown" is not an aspiration — it is the **current default state of every
execution**, because no asset can determine which of the other four it is in.

### Development
| | |
|---|---|
| **Purpose** | Engineer's own work. Data is disposable. |
| **Permitted** | Family A, Family B |
| **Prohibited** | Family C, Family D |
| **Service role** | Permitted |
| **External integrations** | **None.** No Xero credential, no live OpenAI key, no outbound email. |
| **Storage** | Own bucket; may be cleared without notice |
| **Authentication** | Any identity the engineer created |

**[INFERRED]** The "no external integrations" rule is the single highest-value environment control
in this document. It is what makes the Family D target-discovery pattern *structurally* impossible
rather than merely prohibited: a script that searches a Development database for a live Xero
connection finds nothing, and fails closed at its own `fail("select_workspace", …)` call — which is
already how these scripts behave when no connected workspace exists
(`tmp-xero-integration-regression-probe.mjs:59`).

### PAT
| | |
|---|---|
| **Purpose** | Acceptance testing and release gating. Deterministic, resettable. |
| **Permitted** | A, B; C and D with approval |
| **Prohibited** | Exploratory work — determinism is the asset |
| **Service role** | Permitted; anon-key path must also be exercised (Part 6) |
| **External integrations** | PAT-only credentials: Xero demo company, capture sink for email, replay-mode AI |
| **Storage** | PAT buckets, reset atomically with the database |
| **Authentication** | Fixed identity matrix per `PAT-ARCHITECTURE.md` §2.4 |

### Staging
| | |
|---|---|
| **Purpose** | Pre-production rehearsal. Production-shaped configuration. |
| **Permitted** | Family A only |
| **Prohibited** | B, C, D |
| **Service role** | Read-only role preferred; full service role by exception |
| **External integrations** | Production-shaped; therefore no test may touch them |
| **Storage** | Read-only |
| **Authentication** | Real session flows, no fabricated identities |

**[INFERRED]** Staging is deliberately more restrictive than PAT. Its value is that it is
configured like Production; that value is destroyed the moment test data enters it, and its
production-shaped integration credentials make it as dangerous as Production for Family D.

### Production
| | |
|---|---|
| **Purpose** | Live customers. |
| **Permitted** | Family A, with output redaction |
| **Prohibited** | B, C, D — absolutely, with no approval path |
| **Service role** | By exception, named approver, time-boxed, logged |
| **External integrations** | Never touched by any validation asset |
| **Storage** | Read-only; never enumerated into a log |
| **Authentication** | No fabricated identity may ever be created |

**[INFERRED]** Family B is prohibited in Production even though its cleanup is complete, for the
three reasons in Part 2. There is no approval path for B, C or D here. An approval path is a
mechanism for exceptions, and the audit's evidence is that exceptions in this area are not
recoverable — `TEST-INFRASTRUCTURE-AUDIT.md` §5.1 documents six categories of effect, of which three
cannot be undone by any code.

### Unknown
| | |
|---|---|
| **Purpose** | The fail-closed default. Every environment is Unknown until proven otherwise. |
| **Permitted** | **Nothing.** |
| **Prohibited** | All four families |
| **Service role** | Refused |
| **External integrations** | Refused |
| **Storage** | Refused |
| **Authentication** | Refused |

> **Rule 4 — Unknown is treated as Production.**
> An environment that cannot be *proven* to be Development or PAT is Production for policy purposes.
> Absence of evidence is not evidence of safety.

**[INFERRED]** This is the rule that makes the whole model independent of §1.4. The programme does
not need to know whether `bzzlhzgfvnnwxjxvpzdk` is production, because until someone proves what it
is, it is governed as if it were.

## 3.2 Environment permission matrix

| | Dev | PAT | Staging | Production | Unknown |
|---|---|---|---|---|---|
| **A — Read-only** | ✅ | ✅ | ✅ | ✅ redacted | ❌ |
| **B — Ephemeral** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **C — Persistent** | ❌ | ⚠ approval | ❌ | ❌ | ❌ |
| **D — External** | ❌ | ⚠ approval + allowlist | ❌ | ❌ | ❌ |

---

# PART 4 — Environment Detection

## 4.1 The design problem

**[VERIFIED]** The audit found that `NEXT_PUBLIC_APP_URL` defaults to `http://localhost:3007` in 33
of 34 application-driving assets. That default is the only thing keeping them pointed at a local
server. **If `.env.local` sets `NEXT_PUBLIC_APP_URL` to a deployed URL, all 33 silently retarget**,
writing through the deployed application. `test-manage-login.mjs:14` hard-codes localhost with no
override and is the sole exception — by accident, not design.

**[VERIFIED]** Worse, the database a script connects to and the application it drives are configured
independently. A script reads `NEXT_PUBLIC_SUPABASE_URL` for its own client and `NEXT_PUBLIC_APP_URL`
for its HTTP calls. **Nothing asserts these resolve to the same environment.** A script can validate
against a local database while mutating a deployed one.

**[INFERRED]** Both failures share a cause: **environment is inferred from a single indicator, and
the indicator has a permissive default.** A single-signal check with a fallback is not a guard; it
is a suggestion.

## 4.2 The five-signal model **[TO BUILD]**

Execution is permitted only when **all applicable signals agree**. Disagreement aborts. **Absence of
a signal counts as disagreement, not as a pass** — this is the property that makes the model
fail-closed and it must not be softened.

### Signal 1 — Explicit declaration
`VYRON_ENV` ∈ {`development`, `pat`, `staging`, `production`}. Unset ⇒ **Unknown** ⇒ abort.

*Why insufficient alone:* it is a string an engineer types. It records intent, not fact.

### Signal 2 — Database identity
Extract the Supabase project reference from the resolved URL; match against a **committed,
reviewed** allowlist mapping reference → environment. Unlisted ⇒ Unknown ⇒ abort.

*Repository-specific requirement.* **[VERIFIED]** `.env.local` sets the URL with a `/rest/v1/`
suffix, which `.env.example:12` explicitly warns against, and all 47 assets strip it defensively
(`.replace(/\/rest\/v1\/?$/i, "")`) — 47 identical workarounds for one malformed value. **Signal 2
must normalise before matching, and must reject a URL it cannot parse rather than falling through
to a bare-hostname comparison.**

### Signal 3 — Application target identity
Resolve the application base URL host and match against the same allowlist. **Signals 2 and 3 must
resolve to the *same* environment.** Divergence ⇒ abort.

*This signal exists solely to close the split-target defect in §4.1.* It has no analogue in
`PAT-ARCHITECTURE.md` §2.3, which guards only the database.

### Signal 4 — Asset manifest
Each asset declares, in a machine-readable header: its family, its permitted environments, whether
it mutates, whether it touches external systems, and its cleanup contract. The declared family is
checked against the resolved environment via the Part 3 matrix.

*Why this is a detection signal and not merely metadata:* it is the only signal that can be
cross-checked against the asset's own code (Part 9, Mutation Gate). A script declaring Family A
whose source contains `.insert(` fails the gate. **The manifest is an assertion the repository can
falsify** — the others cannot be.

### Signal 5 — Interactive confirmation
For Family C and D, and for any Family B execution outside Development: the operator is shown the
resolved environment, project reference, application host, family, and — for Family D — the exact
external target and its declared side-effects, and must confirm.

*Constraint:* the prompt must display **resolved values, never configured ones**. A prompt echoing
`$VYRON_ENV` confirms the engineer's intent back to them, which is worthless. It must display what
signals 2 and 3 actually resolved to.

## 4.3 Quorum

| Family | Signals required |
|---|---|
| A | 1, 2, 4 |
| B | 1, 2, 3, 4 — plus 5 outside Development |
| C | All five |
| D | All five, plus the external allowlist (Part 5) |

**Non-negotiable properties [TO BUILD]:**
- Evaluated **before any client is constructed**, per `PAT-ARCHITECTURE.md` §2.3.
- **No bypass flag exists.** Not `--force`, not an environment variable. A bypass is used in exactly
  the circumstances the guard exists for.
- Abort is `process.exit(1)` with a message naming which signal failed and what it resolved to.
- The guard is a **single shared module**. **[INFERRED]** This is what makes the work tractable: the
  audit found the same 10-line preamble duplicated 47 times. Replacing that one block with a guarded
  module puts all five signals in front of every asset in a single mechanical change. **The
  duplication that created the problem is what makes the fix cheap.**

## 4.4 An existing pattern worth preserving

**[VERIFIED]** `.tmp-fg-cert/certify-fg-export.mjs:20` loads `.env.local` with
`if (!process.env[key]) process.env[key] = value` — it **respects pre-set shell variables**. All 46
assets under `scripts/` overwrite unconditionally, meaning an engineer cannot redirect them from the
shell; `.env.local` always wins.

**[INFERRED]** The shared loader must adopt the `.tmp-fg-cert` precedence. Without it, `VYRON_ENV`
set in a terminal is silently overwritten by the file, and Signal 1 becomes unusable.

---

# PART 5 — External Integration Safety

## 5.1 Why this family needs a dedicated model

**[INFERRED]** Every other control in this document works by constraining *where a script connects*.
Family D defeats that class of control, for a reason the audit made concrete: the script's Xero
credential is not in its configuration. **It is a row in whatever database it reached.** A guard that
approves the database connection has, by approving it, granted access to every credential inside it.

The controls must therefore sit at three layers that a connection guard does not reach: how the
target is **selected**, whether the target is **permitted**, and what happens when the operation
**fails mid-flight**.

## 5.2 Prohibited patterns **[TO BUILD]**

Each is stated with the evidence that motivates it.

**P1 — Credential discovery by query.**
No asset may locate an integration credential by querying for one.
**[VERIFIED]** `tmp-enterprise-financial-certification.mjs:80-83` and five siblings select a
workspace *because* it has `connected && accessToken && refreshToken && tenantId`. This is the root
mechanism: it converts "a database I am allowed to read" into "a customer I am allowed to act as".

**P2 — Target discovery.**
The workspace, tenant or organisation must be supplied by configuration. An asset that searches for
its target is non-compliant regardless of its behaviour afterwards.

**P3 — Direct third-party calls that bypass the application.**
**[VERIFIED]** `tmp-product-overrides-only-cert.mjs:129-135` reads the stored access token and calls
`api.xero.com` directly, bypassing the permission layer, audit log and rate limiting. Verification
against a third party must go through the application's own client, or through a read-only path
using a credential provisioned for verification.

**P4 — Membership injection into a workspace the asset did not create.**
**[VERIFIED]** Six assets insert `role: "OWNER"` into a pre-existing workspace. This is
privilege escalation performed by the test suite. Under Part 7 an asset may only act as an identity
it created inside a tenant it created.

**P5 — Unrestored configuration mutation.**
**[VERIFIED]** `save-defaults` overwrites the company-wide Xero account mapping with an arbitrarily
selected revenue account (`pick(catalog, /revenue|income|otherincome/)`); the prior value is never
read, never stored, never restored. Any asset that mutates configuration must capture the prior
state first and restore it in teardown — and must **verify** the restoration (Part 7 §7.5).

## 5.3 Required protections by operation

| Operation | Evidence | Required protection **[TO BUILD]** |
|---|---|---|
| **OAuth connection** | 6 assets adopt a live connection | Connection must be established by the PAT provisioning process against a Xero **demo company**. Assets consume, never establish. |
| **Refresh-token rotation** | `tmp-xero-integration-regression-probe.mjs:79` | **Prohibited outside PAT.** Xero refresh tokens are single-use and rotate; a failure to persist the new token breaks the customer's connection. Permitted in PAT only where the connection is re-establishable by reset. |
| **Invoice creation** | `tmp-product-overrides-only-cert.mjs` — 3 per run | Permitted only against a demo organisation on the allowlist. Every created `xeroId` recorded to the artefact ledger **before** the call. A reconciliation tool must be able to list and void them. |
| **Chart-of-accounts sync** | 4 assets | PAT demo organisation only. |
| **Account-mapping defaults** | `save-defaults` in 3 assets | Capture-then-restore mandatory, with post-teardown verification. |
| **Bulk sync (`sync-all-*`)** | `tmp-xero-integration-regression-probe.mjs:88-95` | Highest-severity operation in the catalogue — pushes every customer, supplier and invoice. Explicit per-execution approval; prohibited in any environment where the connected organisation is not on the allowlist. |
| **AI extraction** | `tmp-preview-e2e.ps1:62` | Replay mode by default, per `PAT-ARCHITECTURE.md` §2.8. Live mode requires explicit opt-in and is a measured metric, never a gate. |
| **Email dispatch** | `test-po-enterprise-hardening.mjs` | Capture sink only. Destination **[UNKNOWN]** (§13.4) — until traced, treat as capable of sending real mail. |
| **Storage** | 3 assets | Every uploaded object registered in the artefact ledger. Teardown must delete via the storage API, never by deleting the `vyron_documents` row. |

## 5.4 The external allowlist **[TO BUILD]**

A committed, reviewed file mapping every permitted external target to an environment: Xero tenant
ids of demo organisations, the email capture sink host, the AI mode, and the storage bucket per
environment.

Checked immediately before the first outbound call, not at start-up. **[INFERRED]** Timing matters:
these scripts resolve their target after connecting and querying, so a start-up check would validate
a target that has not been chosen yet.

## 5.5 Crash-consistency

**[INFERRED]** The audit's most important structural insight about Family D is that **the local
teardown and the external mutation cannot be made atomic.** A crash between "invoice pushed to Xero"
and "record it locally" leaves an external artefact nothing knows about.

The mitigation is ordering plus durability: **write the intent to the ledger, flush it, then issue
the call.** This produces false positives — ledger entries for calls that never completed — which is
the correct direction of error. A reconciliation tool that checks a Xero invoice that does not exist
costs nothing; one that misses an invoice that does exist is the failure mode being prevented.

## 5.6 Disposition of the six Xero assets

**[INFERRED]** Their *intent* — proving account-mapping precedence (product → category → company
default) and sync correctness — is legitimate and valuable, and three of them assert the same
precedence rule (`TEST-INFRASTRUCTURE-AUDIT.md` §7.1). **Their method is not correctable by
patching**, because target discovery is their first action and everything downstream depends on it.

Disposition: **replace, preserving the assertions.** One consolidated precedence test and one sync
test, against a PAT demo organisation, with explicit target configuration. The six existing assets
are quarantined in Phase 0 and deleted only after the replacements pass — the assertions are the
asset, and they should not be lost with the scripts that carry them.

---

# PART 6 — Authentication Model

## 6.1 Current state

**[VERIFIED]** All 47 database-touching assets authenticate with `SUPABASE_SERVICE_ROLE_KEY`. Zero
use `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**[INFERRED]** The consequence is precise and important: **the suite can prove the application's
permission checks work; it cannot prove the database's do.** Setup, assertions and teardown all run
with RLS disabled. `PAT-ARCHITECTURE.md` §2.2 identifies the circularity — tenant isolation enforced
only by application-level `company_id` filtering means the isolation boundary is the correctness of
the thing being tested. RLS is the non-circular boundary, and **it is verified by nothing.**

## 6.2 The five modes

### Anonymous
| | |
|---|---|
| **Permitted use** | Public endpoints; **RLS policy verification** |
| **Risks** | Minimal — the least privileged mode |
| **Approvals** | None |
| **Audit** | Not required |

**[TO BUILD]** No asset uses this mode today, and closing that is the highest-value addition to the
authentication model. An RLS suite operating as an anonymous or low-privilege client, attempting
cross-tenant reads and writes and asserting they fail, is the only way to verify the boundary the
service role bypasses.

**[VERIFIED] Related open question.** `test-intelligence-modules-certification.mjs:176` and `:179`
call `/api/enterprise-platform/search` and `/api/enterprise/auditor-search` **without cookies** and
assert `ok: true`, while every other call in that file passes `ctx.cookies`. The suite therefore
encodes an expectation that these endpoints are publicly reachable. **This is either a documented
design decision or an authentication gap the suite is locking in, and it needs a decision, not an
assumption.**

### Authenticated User
| | |
|---|---|
| **Permitted use** | All behavioural assertions in Families B, C, D |
| **Risks** | Low, provided the identity was created by the asset |
| **Approvals** | None |
| **Audit** | Identity recorded in the artefact ledger |

**Rule:** an asset may authenticate only as an identity it created, inside a tenant it created. This
is what P4 (§5.2) prohibits violating.

### Service Role
| | |
|---|---|
| **Permitted use** | Fixture setup and teardown only |
| **Risks** | **RLS bypassed.** A wrong or absent `company_id` filter writes across tenants. |
| **Approvals** | None in Dev/PAT; named approver, time-boxed and logged in Production |
| **Audit** | Every service-role write recorded to the ledger |

**Rule — separation of concerns [TO BUILD]:** the service role may build and dismantle fixtures. It
**may not be used to make an assertion that a user-facing operation is permitted**, because it
bypasses the mechanism under test. Reading state back to verify an effect is permitted; using it to
perform the effect under test is not.

**Rule — every service-role write is `company_id`-scoped.** **[VERIFIED]** The existing teardown
blocks already do this consistently (`.eq("company_id", ctx.companyId)`), which is good practice
worth codifying rather than a defect to fix. One documented inconsistency: `vyron_documents` is
scoped by **`tenant_id`**, not `company_id` (`test-po-enterprise-hardening.mjs` teardown), so a
generic teardown helper must handle the column name per table rather than assuming it.

### Platform Administrator
| | |
|---|---|
| **Permitted use** | Platform-admin flows only — company provisioning, cross-workspace administration |
| **Risks** | **Highest privilege the product issues.** Survives failed cleanup (Part 2, Family C) |
| **Approvals** | Named approver per execution, in every environment including PAT |
| **Audit** | Creation and deletion both recorded and **verified** |

**[VERIFIED]** `test-companies-module-certification.mjs` is the only asset that creates one, and its
cleanup is bounded at 2,000 users and fails silently past that. **[TO BUILD]** Platform-admin
creation must be ledger-registered before the row is written, and teardown must **verify by
re-query** that the row is gone. This is the one identity type where "cleanup ran" is not an
acceptable substitute for "cleanup is confirmed".

### System Integration
| | |
|---|---|
| **Permitted use** | Family D only, against allowlisted non-production targets |
| **Risks** | Acts as the customer in a third-party system; effects are irreversible |
| **Approvals** | Named approver + pre-declared side-effects |
| **Audit** | Every outbound mutation ledger-recorded **before** it is issued (§5.5) |

**Rule:** an integration credential must be received through explicit configuration, never read from
the database. This is P1 (§5.2), stated as an authentication rule because that is where it will be
enforced.

## 6.3 Summary

| Mode | Assets today | Dev | PAT | Staging | Prod | Approval |
|---|---|---|---|---|---|---|
| Anonymous | **0** | ✅ | ✅ | ✅ | ✅ | None |
| Authenticated User | 34 | ✅ | ✅ | ❌ | ❌ | None |
| Service Role | 47 | ✅ | ✅ | ⚠ read-only | ⚠ exception | Prod only |
| Platform Admin | 1 | ⚠ | ⚠ | ❌ | ❌ | Always |
| System Integration | 10 | ❌ | ⚠ | ❌ | ❌ | Always |

---

# PART 7 — Cleanup Standard

## 7.1 The pattern being formalised

**[VERIFIED]** 26 assets follow an ephemeral-tenant pattern: create a stamped auth user, company,
workspace and membership; drive the scenario through real API routes; delete in `finally`. **They do
not mutate pre-existing customer records.** This is a genuine engineering asset and the audit's most
important positive finding.

The reference implementation is `test-branches-warehouses-module-certification.mjs` —
`cleanupWorkspace` tears down 29 tables in foreign-key order, plus per-email user teardown. The
standard below is that pattern, with the four defects the audit identified closed.

## 7.2 Creation

**[TO BUILD]**
1. Every entity is created through a helper that **registers it in the artefact ledger before the
   creating call is issued** (§7.3). Register-then-create, never create-then-register — a crash
   between the two must leave a false positive, not an orphan.
2. Identifiers are **deterministic**. **[VERIFIED]** every asset today keys fixtures on
   `Date.now()`, and `test-companies-module-certification.mjs:67` adds `Math.random()`. **[INFERRED]**
   The cost is that no assertion can reference an exact expected value and no run is reproducible —
   this contradicts `PAT-ARCHITECTURE.md` §3.1 principle 1 and is the main obstacle to converting
   these assets. Replace with fixed UUIDs from the seed plus a per-run identifier that is an input,
   not a clock read.
3. An asset creates only entities it owns.

## 7.3 Tracking — the artefact ledger

**[TO BUILD]** The central new mechanism, and the answer to the audit's finding that in-memory
tracking cannot survive the paths that matter.

- **Durable.** Written to disk, flushed on each append. Must survive `SIGINT` and process death.
- **Ordered.** Records creation order so teardown can reverse it.
- **Typed.** Each entry: entity type, identifier, owning table (or external system), scope column
  and value, and whether teardown has confirmed removal.
- **External-aware.** Xero invoice ids, storage object paths and dispatched emails are entries, not
  afterthoughts.
- **Reconcilable.** A standalone tool reads any ledger and completes teardown for a run that never
  finished.

**[INFERRED]** This closes the defect no amount of care in the `finally` block can close. `finally`
does not run on `SIGINT`, on `process.exit()` inside the try, or on host death — and several assets
call `process.exit()` inside their try, guaranteeing the `finally` is skipped on exactly the paths
where cleanup matters most (`TEST-INFRASTRUCTURE-AUDIT.md` §11.5). The ledger moves recovery out of
the crashing process.

## 7.4 Cleanup

**[TO BUILD]**
1. **Ledger-driven**, in reverse creation order. Not a hand-maintained delete list — hand-maintained
   lists are what produced the eight partial-cleanup assets.
2. **Idempotent.** Safe to run repeatedly; a missing entity is success, not failure.
3. **Complete by construction.** Because it is ledger-driven, an entity that was created is
   necessarily torn down. **[VERIFIED]** This is the direct fix for
   `test-manufacturing-lifecycle-enterprise.mjs`, whose `cleanupWorkspace` deletes three rows while
   the script created production runs, run lines, an audit log, products, stock items and finished
   goods — all orphaned with a `company_id` pointing at a deleted company, invisible to every
   tenant-scoped query in the application.
4. **Unbounded.** No pagination ceiling. **[VERIFIED]** The 2,000-user ceiling in
   `cleanupUserByEmail` is exactly the class of silent bound this rule prohibits. Entities are
   removed by recorded identifier, never by searching for them.
5. **Storage via the storage API.** Deleting a `vyron_documents` row does not remove the object.
6. **Interrupt-aware.** Signal handlers attempt teardown; the ledger guarantees recovery when they
   cannot.

## 7.5 Verification — the rule that changes the standard

**[TO BUILD]** After teardown, **re-query every ledger entry and assert its absence.** A run that
cannot confirm teardown **fails, and reports as a cleanup failure distinct from an assertion
failure.**

**[INFERRED]** This is the most consequential single rule in Part 7. Every defect the audit found in
this area shares one property: **the cleanup code ran, and the engineer had no way to know it had
not worked.** `cleanupUserByEmail` returns silently past 2,000 users. `cleanupWorkspace` deletes
three of nine table families. Teardown of `vyron_documents` rows leaves storage untouched. In all
three the script reported success. Verification converts a silent, compounding defect into a loud,
immediate one.

## 7.6 Rollback and reset

**[TO BUILD]** Two distinct mechanisms, not one:

| | Rollback | Reset |
|---|---|---|
| **Scope** | One run's artefacts | The entire environment |
| **Trigger** | End of run, or reconciliation of an abandoned ledger | Before each gated PAT run |
| **Mechanism** | Ledger-driven teardown | Snapshot restore, or truncate + reseed |
| **Covers external?** | Yes, where reversible (storage yes; Xero invoices only by voiding) | Database + storage atomically |

**[INFERRED]** `PAT-ARCHITECTURE.md` §3.3 requires reset *before* each run rather than cleanup after,
and the audit strengthens that. Cleanup-only strategies fail exactly when the previous run crashed —
which is when clean state matters most. Rollback is a courtesy that keeps the environment usable;
**reset is the guarantee**, and neither substitutes for the other.

## 7.7 The standard, as an asset contract

An asset satisfies the Cleanup Standard when all seven hold:

1. Declares its cleanup contract in its manifest (Part 4, Signal 4).
2. Registers every artefact — internal and external — before creating it.
3. Creates only entities it owns, with deterministic identifiers.
4. Tears down from the ledger, in reverse order, idempotently, without bounds.
5. **Verifies teardown by re-query and fails if verification fails.**
6. Leaves a recoverable ledger if it dies.
7. Runs successfully against an environment containing residue from a prior run.

**[VERIFIED]** No asset in the repository satisfies all seven today. Eleven satisfy (3) and (4)
substantially and are the migration candidates.

---

# PART 8 — Credential Governance

*Policy only. No secret values are discussed, and none were read during the audit beyond variable
names and non-secret URLs.*

## 8.1 Governing principles

**[INFERRED]** from the audit's two credential findings:

- **P-1 — A credential in git is compromised, permanently.** Removing the file does not remove it
  from history. Expiry is not remediation.
- **P-2 — A credential reachable from a database is a credential the connecting process holds.**
  This is the insight behind Family D. A process that can read `vyron_xero_workspace_settings` holds
  every OAuth token in it, whatever its intent.
- **P-3 — Credentials are scoped to one environment and never shared across two.** A credential
  valid in two environments makes the environment boundary decorative.
- **P-4 — Least privilege by default.** Zero assets use the anon key today; every schema probe reads
  with RLS disabled and none needs to.

## 8.2 Governance by credential type

### Session cookies
| | |
|---|---|
| **Permitted source** | Created at runtime by the asset, for an identity the asset created |
| **Prohibited** | Committed to the repository; reused across runs; captured from a real user's browser |
| **Storage** | Process memory only |
| **Lifetime** | The run |

**[VERIFIED]** Two current violations. `scripts/tmp-preview-e2e.ps1:4` hard-codes a session cookie
carrying a real user id, real email address, first name, surname, role `OWNER`, real workspace and
company ids, company name, trading name, contact email, phone number, and `"impersonating":true` —
indicating it was minted through the platform-admin impersonation path, the most privileged session
the product issues. `cookies-test.txt` is a git-tracked Netscape cookie file holding the same two
cookie names, consumed by `.tmp-fg-cert/certify-fg-export.mjs`. *(Its contents were not decoded
during the audit; classification rests on tracking status, cookie names, and the cookie contract
evidenced in the `.ps1`.)*

**[INFERRED]** Beyond the credential exposure, this is a **customer data disclosure**: company name,
trading name, contact details and internal identifiers of an identifiable third party, committed to
a repository. `PAT-ARCHITECTURE.md` §4 already prohibits third-party commercial data entering the
repository; that prohibition needs to cover credentials and fixtures, not only invoice assets.

### OAuth tokens
| | |
|---|---|
| **Permitted source** | Provisioned into the environment for a non-production integration target |
| **Prohibited** | **Discovery by database query (P1, §5.2)**; extraction for direct third-party calls; rotation outside PAT |
| **Storage** | The application's connection store, never a script variable |
| **Lifetime** | Managed by the integration; rotation is a privileged operation |

### API keys — OpenAI and equivalents
| | |
|---|---|
| **Permitted source** | Environment configuration, per environment |
| **Prohibited** | Production keys in Dev or PAT; committed keys |
| **Notes** | Metered. Replay mode by default; live mode explicitly opted into and separately budgeted (`PAT-ARCHITECTURE.md` §2.8) |

**[VERIFIED]** OpenAI is reached only from `src/app/api/document-intelligence/extract/route.ts`,
`src/app/api/documents/[id]/extract/route.ts` and `.../health/route.ts`. **`/api/cost-ai-insights`
and `/api/demand-forecast` do not call OpenAI** — they are deterministic computation, so
`test-intelligence-modules-certification.mjs` incurs no AI spend and no provider non-determinism.
Only `tmp-preview-e2e.ps1` reaches the metered path.

### Service-role keys
| | |
|---|---|
| **Permitted source** | Environment configuration; **one key per environment, never shared** |
| **Prohibited** | Any client-reachable context; use for assertions that bypass the mechanism under test (Part 6) |
| **Storage** | Process memory, loaded through the shared guarded loader |
| **Lifetime** | Rotated on a defined schedule and on any suspected exposure |

**[VERIFIED]** Today all 47 assets read this key from `.env.local` by hand-parsing. **[INFERRED]**
Because the parse precedes any environment check, **the production service-role key is loaded into
process memory before anything has decided whether the script should run.** Part 4's requirement that
the guard evaluate *before any client is constructed* must be strengthened here: it must evaluate
**before the key is read**, not merely before it is used.

### Temporary and test credentials
| | |
|---|---|
| **Permitted source** | Generated per run for identities the asset creates; or the fixed PAT identity matrix (`PAT-ARCHITECTURE.md` §2.4) |
| **Prohibited** | Reuse outside PAT; passwords that would grant access if the identity survived cleanup |
| **Lifetime** | The run, or the seed generation |

**[VERIFIED]** Assets today use literal passwords (`Probe123!`, `PermTest123!`, `PlatformCert123!`)
for identities they create. **[INFERRED]** Acceptable *only* because those identities are supposed to
be short-lived — which the seven no-cleanup assets and the 2,000-user ceiling make unreliable. In PAT
with a fixed identity matrix, committed non-secret credentials are correct by design. **In any
environment where cleanup is not verified, a known password on a surviving account is a live
credential.** This is the strongest argument for §7.5 and it is why the two rules must ship together.

## 8.3 Handling a suspected exposure

**[INFERRED]** A standing procedure, so the decision is not made under pressure:

1. **Contain** — treat as compromised; assume history retains it.
2. **Assess reach** — which environments does it open, and does it cross an environment boundary
   (P-3)?
3. **Rotate** — a decision for the credential owner, not the discovering engineer.
4. **Assess disclosure separately** — credential rotation does not remediate third-party PII in
   history. That is a distinct decision, weighing history rewrite against the customer's interest.
5. **Close the source** — a committed credential means an asset needed a credential and had no
   supported way to receive one. Add the supported way, or the pattern returns.

---

# PART 9 — Repository Safety Gates

## 9.1 Principles

**[TO BUILD]**
- Gates are evaluated in order; the first failure aborts.
- Every gate is **fail-closed**: it must affirmatively prove its condition. Absence of evidence is
  failure.
- **No bypass exists for any gate.**
- Each emits a ledger record so a run's compliance is reconstructable afterwards.

## 9.2 The six gates

### Gate 1 — Environment Gate
**Asks:** which environment is this, and is this asset permitted here?
**Checks:** the five signals (Part 4) at the quorum for the declared family; Part 3 matrix lookup.
**Blocks:** execution in an Unknown environment; any family not permitted there.
**Fail mode:** exit 1, naming the failing signal and its resolved value.
**Evidence:** `VYRON_ENV`, project reference, application host, family, matrix decision.
**Closes:** §1.1 Fact 1; the split-target defect in §4.1.

### Gate 2 — Credential Gate
**Asks:** are the credentials in scope the minimum this asset needs, and do they belong to this
environment?
**Checks:** required credentials present; each belongs to the resolved environment (P-3); privilege
does not exceed the manifest's declaration; **no credential was obtained by database query** (P1).
**Blocks:** cross-environment credentials; service role where the manifest declares anonymous or
user; discovered integration credentials.
**Fail mode:** exit 1, **before the credential is read into memory** (§8.2).
**Evidence:** credential types in scope, declared privilege, environment binding.
**Closes:** §1.1 Fact 2's root mechanism; the load-before-check defect.

### Gate 3 — Mutation Gate
**Asks:** does this asset's declared write behaviour match its actual code?
**Checks:** static analysis of the source for `.insert(`, `.update(`, `.delete(`, `.upsert(`,
`.rpc(`, `.storage`, and outbound mutating calls; compared against the manifest.
**Blocks:** any asset whose code mutates more than it declares.
**Fail mode:** exit 1, listing the undeclared operations and their line numbers.
**Evidence:** operation inventory, manifest, reconciliation.

**[INFERRED]** This gate is what makes the manifest trustworthy. Signals 1, 2, 3 and 5 record what a
human asserts; Signal 4 is the only one the repository can falsify against the code, and Gate 3 is
the falsification. **[VERIFIED]** The audit's structural matrix — mechanical extraction of operation
counts per file — is the working prototype of exactly this check, and it correctly separated the 14
read-only assets from the 33 that write.

### Gate 4 — External Integration Gate
**Asks:** is every external target explicitly configured and on the allowlist?
**Checks:** no target discovery (P2); no direct third-party call bypassing the application (P3);
every target on the allowlist for this environment; declared side-effects present.
**Blocks:** all Family D execution outside PAT; any discovered target; any unlisted target.
**Fail mode:** exit 1 immediately before the first outbound call — the point at which the target is
known.
**Evidence:** targets, allowlist decision, declared side-effects, approver.
**Closes:** §1.1 Fact 2 in full.

### Gate 5 — Cleanup Gate
**Asks:** can this asset guarantee it will leave nothing behind?
**Checks (pre-execution):** ledger is writable and durable; teardown is ledger-driven, not
hand-listed; interrupt handlers registered; contract declared.
**Blocks:** any mutating asset without a functioning ledger; any Family C asset outside PAT.
**Fail mode:** exit 1 before the first write.
**Evidence:** ledger path, contract, handler registration.

### Gate 6 — Verification Gate
**Asks:** did cleanup actually work?
**Checks (post-execution):** re-query every ledger entry; assert absence; assert restoration of
every captured configuration value (P5); reconcile external artefacts.
**Blocks:** nothing — it runs after the work. It **fails the run** and raises an unreconciled-residue
alert.
**Fail mode:** non-zero exit distinct from assertion failure, plus a retained ledger for
reconciliation.
**Evidence:** per-entry confirmation, residue list, reconciliation status.
**Closes:** §5.3 HIGH; the silent-cleanup-failure class in §7.5.

## 9.3 Applicability

| Gate | A | B | C | D |
|---|---|---|---|---|
| 1 Environment | ✅ | ✅ | ✅ | ✅ |
| 2 Credential | ✅ | ✅ | ✅ | ✅ |
| 3 Mutation | ✅ | ✅ | ✅ | ✅ |
| 4 External | — | — | — | ✅ |
| 5 Cleanup | — | ✅ | ✅ | ✅ |
| 6 Verification | — | ✅ | ✅ | ✅ |

**[INFERRED]** Gates 1–3 apply to Family A because a read-only asset can still read the wrong
database with the wrong credential — a confidentiality risk, not an integrity one, and Gate 3 is what
proves it is read-only rather than merely named that way.

## 9.4 Relationship to the PAT release gates

**[INFERRED]** No overlap, and the distinction should be stated because both are called "gates":

| | RSP Gates 1–6 | PAT Gates 1–6 (`PAT-ARCHITECTURE.md` §6) |
|---|---|---|
| **Question** | May this asset run here, safely? | Is this release fit to ship? |
| **Subject** | The validation asset | The product change |
| **When** | Every execution | Merge and release |
| **Failure** | Execution refused | Release blocked |

**RSP gates run first and unconditionally.** A PAT gate that invokes an asset invokes it through the
RSP gates. **[INFERRED]** PAT Gate 3 (Functional Validation) therefore cannot pass in an environment
where RSP Gate 1 fails — which is the correct dependency, and the concrete sense in which repository
safety precedes PAT.

---

# PART 10 — Repository Safety Checklist

For engineers. Written to be usable before the tooling exists — every item is answerable by reading
the asset and its manifest.

## Before execution

**Understand the asset**
- [ ] I have read it, not only its filename. **[VERIFIED]** 24 assets are named `tmp-*`; all are
      git-tracked and permanent, and six write to a live customer's accounting system. The prefix is
      not information.
- [ ] I know its family (A/B/C/D) and why.
- [ ] I know every table, storage bucket and external system it touches.
- [ ] I know what it does **on failure**, not only on success. Does `finally` run on every exit path
      it can take? Does it `process.exit()` inside its try block?

**Verify the environment**
- [ ] `VYRON_ENV` is set and matches my intent.
- [ ] The **resolved** Supabase project reference is what I expect — not the configured value, the
      resolved one.
- [ ] The **resolved** application base URL is the same environment as the database. **[VERIFIED]**
      Nothing asserts this today, and 33 assets silently retarget if `NEXT_PUBLIC_APP_URL` points
      elsewhere.
- [ ] The environment permits this family (Part 3 matrix).
- [ ] **If I cannot prove the environment, I stop.** Unknown is Production (Rule 4).

**Verify credentials**
- [ ] The asset needs the privilege it will use; a lower one will not do.
- [ ] No credential in scope is valid in another environment.
- [ ] The asset does not obtain a credential by querying the database (P1).

**External systems**
- [ ] The asset touches no external system, **or** its target is explicitly configured, allowlisted,
      non-production, and I have written down what it will create there.
- [ ] I have the named approval, and the approver saw the declared side-effects.

## During execution

- [ ] I do not interrupt a mutating asset unless I must; if I do, I record the ledger path.
- [ ] I watch for the asset silently switching target — a fail-fast script that stops early may
      leave later stages unattempted, and a fail-open one may proceed on the wrong target.
- [ ] I do not re-run on failure until I understand what the failed run left behind. **[VERIFIED]**
      A failed run of a Family C asset leaves more residue than a successful one.

## After execution

- [ ] Exit code understood. **[VERIFIED]** Conventions differ across the suite: `0/1`, `0/2`, and
      structured-diagnostic-then-`exit(2)`. Do not assume non-zero means "test failed"; it may mean
      "environment wrong".
- [ ] If the asset fails fast, I know that **one early failure masks every later assertion** —
      one reported failure may conceal twenty.
- [ ] Results recorded where the next engineer will find them.

## Cleanup verification

- [ ] Teardown ran **and I confirmed it worked** — not "the script printed success".
- [ ] I checked for the entity types this asset's teardown is known to omit. **[VERIFIED]** Partial
      cleanup orphans production runs, run lines, audit logs, products, stock items and finished
      goods; a `PLATFORM_ADMIN` can survive past 2,000 auth users; storage objects survive
      `vyron_documents` row deletion.
- [ ] Any configuration the asset overwrote is restored **and verified** (P5).
- [ ] External artefacts reconciled: Xero records, storage objects, dispatched emails.
- [ ] Residue that cannot be removed is recorded and escalated, not left for someone to find.

## Audit logging

- [ ] Recorded: who, when, which asset, which environment, resolved project reference, family,
      approver, outcome, ledger path, residue.
- [ ] Family C or D: the approval and the declared side-effects are recorded with the run.

## Documentation

- [ ] If I learned something the asset's manifest does not say, I updated the manifest.
- [ ] If I wrote a new asset, it has a manifest, a family, and a cleanup contract **before** it first
      runs.
- [ ] If I wrote a new asset, I first checked whether one already exists. **[VERIFIED]** The audit
      found five separate duplications, inferred to arise because no engineer could discover what
      existed.

---

# PART 11 — Product Relationship Diagram

## 11.1 Where RSP sits

```
                    ENGINEERING STANDARDS
             (how we build — principles, conventions)
                             │
              ┌──────────────┴──────────────┐
              │                             │
   REPOSITORY SAFETY PROGRAMME      REPOSITORY GOVERNANCE
   "Can our tools cause harm?"      "How does change move
                                     through the repository?"
   Owns: asset classification       Owns: merge order, generated
         environment policy               artefacts, Automated
         execution gates                  Refactoring Standards,
         credential governance            evidence retention
         cleanup standard
              │                             │
              └──────────────┬──────────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
      PRODUCTION ACCEPTANCE      PRODUCT GAP REGISTER
      TESTING (PAT)              "What do we know is
      "Does the product          missing or broken?"
       behave correctly?"
      Owns: catalogue,           Owns: known gaps,
            environment                severity, closure
            topology, seed,
            release gates
                  │                     │
                  └──────────┬──────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
       MERGE PROCESS                RELEASE PROCESS
```

**Reading rule:** RSP governs **the tools**. PAT governs **the product**. Every PAT execution runs
through RSP gates; no RSP control depends on PAT existing.

## 11.2 Ownership boundaries

Stated as exclusive ownership so no responsibility is duplicated.

| Concern | Owner | Explicitly **not** owned by |
|---|---|---|
| Asset family classification | **RSP** | PAT — which catalogues tests, not their safety properties |
| Environment topology and provisioning | **PAT** (§2.1–2.2) | RSP — which consumes the topology as policy input |
| Environment *detection and enforcement* | **RSP** (Part 4) | PAT — §2.3 proposes a guard; RSP supersedes it with the five-signal model |
| Credential governance | **RSP** (Part 8) | PAT — §2.7 describes `.env.pat`; RSP owns the policy around it |
| Cleanup and teardown standard | **RSP** (Part 7) | PAT — which owns *reset*, a different mechanism (§7.6) |
| Test data seed and determinism | **PAT** (§3) | RSP — which requires determinism without specifying the corpus |
| Test catalogue and assertions | **PAT** (§5) | RSP — indifferent to what an asset asserts |
| Release gating | **PAT** (§6) | RSP — whose gates are per-execution, not per-release |
| Merge order, generated artefacts, refactoring standards | **Repository Governance** | RSP, PAT |
| Known product defects | **Product Gap Register** | RSP, PAT |
| **Known unsafe assets** | **RSP** | Product Gap Register — an unsafe script is not a product gap |

**[INFERRED]** The last row is the boundary most likely to be blurred in practice. The six Xero
assets are not product defects — the product behaved as designed. They are tooling defects, and
recording them in the Product Gap Register would place them in a register nobody consults before
running a script. **RSP maintains its own register of unsafe assets, and it is the artefact the
execution policy points at.**

## 11.3 Interfaces

**RSP → PAT.** RSP supplies the classification that determines which assets PAT may adopt. Of 54,
`TEST-INFRASTRUCTURE-AUDIT.md` §6 found 3 ready, 11 ready after configuration, 19 requiring
refactoring, 6 requiring replacement, 15 for retirement. **PAT's P4 consolidation consumes that
list.**

**RSP → Merge Process.** A change adding or modifying a validation asset requires: manifest present,
family declared, Gate 3 reconciliation passing. **[INFERRED]** Cheap to enforce and it prevents the
population regressing while the backlog is worked.

**RSP → Release Process.** No release may ship with an unsafe asset executable in the repository.

**RSP ← Product Gap Register.** Where a gap concerns *validation coverage* rather than product
behaviour — the absent import coverage, the absent RLS verification — RSP records why no asset
exists and what family the future asset will be.

**RSP ↔ Repository Governance.** Governance owns Automated Refactoring Standards. **[VERIFIED]** The
two source codemods are directly in scope: `apply-api-permission-guards.mjs` rewrites 43 route files
by regex, and `fix-api-guard-placement.mjs` exists only because that went wrong once. Neither has
post-condition assertions — the failure `PAT-ARCHITECTURE.md` §6 Gate 2 exists to prevent. **RSP
classifies them as non-validation tooling and hands them to Governance; it does not attempt to own
them.**

---

# PART 12 — Phased Implementation Roadmap

## Phase 0 — Documentation, classification, governance *(no code)*

**Objective:** the repository is understood and the critical risks are contained by means requiring
no code change.

| Deliverable | Notes |
|---|---|
| This document, adopted | |
| **Resolve §1.4** | Determine which Supabase project is production, and enumerate Xero connections in `bzzlhzgfvnnwxjxvpzdk`. Minutes of work; gates the risk rating of everything else. |
| **Quarantine the 10 Family D assets** | Filesystem read-only / non-executable. **No file edited, nothing deleted** — reversible, and closes the critical risk today. |
| **Assess Xero exposure** | Whether any of the six has run against a live organisation, and against which. If so: reconcile the invoice ledger and verify the account mapping. |
| **Treat the two committed credentials as compromised** | Per §8.3. Rotation is a credential-owner decision; PII disclosure is assessed separately. |
| **Residue inventory** | Read-only count of test-pattern tenants (`Perm Co %`, `Proc Test %`, `Probe %`, `CHK PROBE %`, `Intelligence Cert %`, `Companies Cert %`, and the rest), orphaned `auth.users`, surviving `vyron_platform_users`. Sizes §5.3 before anything is cleaned. |
| **`scripts/README.md`** | Per-asset: purpose, family, environment, writes, cleanup, permitted. **[INFERRED]** The highest-value zero-code artefact — its absence is the inferred cause of all five duplications. |
| **Execution policy in `AGENTS.md`** | No asset runs against any environment until it declares a target and has been reviewed. Family D prohibited outright. |
| **Record the discovery probes' answers, then retire them** | Particularly whether `run_sql` / `exec_sql` are exposed (`tmp-live-constraint-proof.mjs:64-72`) — a security fact worth recording deliberately. |

**Exit:** no asset can write to a live customer's external accounting system; every asset is
classified; the environment question is answered.

## Phase 1 — Repository safeguards

**Objective:** no asset can execute against an unproven environment.

- Shared guarded loader replacing the 47 duplicated `.env.local` parsers, with `.tmp-fg-cert`
  precedence (§4.4). **[INFERRED]** Single highest-leverage change in the programme: it places the
  guard in front of every asset at once.
- Five-signal detection (Part 4); the committed environment allowlist.
- Gates 1–3 operational.
- Asset manifests for all 50 validation assets.
- Credential governance (Part 8) in force; loader refuses to read a key before Gate 1 passes.
- Rename by risk class; move the four non-validation assets to `tools/`; declare the missing `glob`
  dependency or delete the codemods.
- `.gitignore`: `cookies-test.txt`, `deployment-gap-report.json`, `.tmp-fg-cert/` **output**.
  **Keep the fixtures** — relocate to `pat/assets/`; **[VERIFIED]** they are the only committed
  validation fixtures with expected outcomes in the repository, which is the pattern
  `PAT-ARCHITECTURE.md` §4 proposes.

**Exit:** Gates 1–3 pass or abort for every asset; nothing runs against Unknown.

## Phase 2 — Script refactoring, cleanup, isolation

**Objective:** every mutating asset removes what it created, verifiably.

- Artefact ledger and reconciliation tool (§7.3).
- Gates 5 and 6 operational.
- Migrate the 11 near-ready assets to the Cleanup Standard.
- Complete teardown for the 8 partial-cleanup assets; write teardown for the 7 with none.
  `test-branches-warehouses-module-certification.mjs` is the reference.
- Remove bounded cleanup — no pagination ceilings.
- Storage teardown via the storage API; `vyron-documents` reconciliation, which does not exist today.
- Consolidate the 8 overlapping schema probes into `validate-schema-drift.mjs` plus table manifests.
- Standardise on accumulate-then-report; eliminate fail-fast masking.
- **Adopt `{module, runtimeStep, rootCause, exactFile, smallestFix}`** from the `tmp-*-cert` family
  as the standard failure schema. **[INFERRED]** Genuinely excellent and already proven in this
  codebase — adopt rather than design.

**Exit:** no asset is Family C; every mutating asset passes Gate 6.

## Phase 3 — PAT integration, execution framework, shared libraries

**Objective:** the safety model becomes the substrate PAT is built on.

- PAT environment provisioned (`PAT-ARCHITECTURE.md` §2); Gate 1 recognises it.
- Deterministic seed with fixed UUIDs and dates, replacing `Date.now()` fixtures.
- Reset, database and storage atomically (§7.6).
- Fixed PAT identity matrix.
- Gate 4 operational; external allowlist; Xero **demo company** provisioned.
- **Rebuild the six Xero assets** as one precedence test and one sync test (§5.6).
- **New coverage for the highest-severity blind spots:** RLS verification via the anon key
  (currently zero coverage), cross-tenant **write** (PAT-AUTHZ-006, untested), supplier import
  fixtures (the largest single gap — 11 PAT-IMPORT tests with no foundation).
- Test runner; the PAT catalogue as the registry.
- Resolve the two unauthenticated-search assertions (§6.2) by decision, not assumption.

**Exit:** PAT executes through RSP gates; Family D exists only against allowlisted non-production
targets.

## Phase 4 — CI/CD, automated certification, scheduled validation

**Objective:** no gate depends on someone remembering.

- RSP Gates 1–6 in CI; a PR touching a validation asset requires manifest, family and Gate 3.
- PAT Gates 1–4 per PR; Gate 5 per release.
- Baseline diffing on `visual-capture.mjs`. **[VERIFIED]** Fix the `fullPage` asymmetry first —
  `visual-capture.mjs:69` sets it only for desktop, so tablet and phone are viewport-clipped and
  below-the-fold regressions are invisible even to a human. Baselines must not be approved before
  this is corrected.
- Structured per-run results — run id, commit SHA, seed version, durations. Prerequisite for any
  regression capability, currently **None**.
- Scheduled: drift check, residue reconciliation, live-mode AI accuracy as a tracked metric.

**Exit:** every gate enforced automatically; residue detected without human initiation.

## Phase 5 — Enterprise validation platform

**Objective:** RSP becomes the standard every VYRON product inherits.

**[VERIFIED] — an important correction to the framing.** `src/platform/products/registry.ts`
registers five products **inside this repository**: `vyron_cost` (`active`), `vyron_core`,
`vyron_pay`, `vyron_farm`, `vyron_reach` (all `planned`). VYRON CORE already has shipped routes
(`src/app/vyron-core/command-centre/page.tsx`, `src/app/api/vyron-core/command-centre/route.ts`)
despite its `planned` status.

**[VERIFIED]** The directive names VYRON PAY, CORE, BUILD, SAFE and SURF4CARS. Of these, **PAY and
CORE are in the registry; BUILD, SAFE and SURF4CARS have no repository evidence** — no module, no
route, no registry entry. **[UNKNOWN]** whether they are separate repositories, planned products, or
named under different identifiers. FARM and REACH are in the registry but were not named in the
directive.

**[INFERRED]** Two consequences:

1. **Phase 5 is not "port RSP to other repositories" for CORE, PAY, FARM and REACH.** They are
   modules in this repository, sharing one `.env.local`, one Supabase project and one service-role
   key. **RSP already governs them.** A validation asset written for VYRON COST operates with
   credentials reaching all five. The multi-product blast radius is present today, not prospective.
2. **For BUILD, SAFE and SURF4CARS the portability question is real but unanswerable from here.**
   The design must therefore be portable *by construction* rather than by adaptation.

**Deliverables:**
- Extract the RSP substrate — guard, ledger, gates, manifest schema, cleanup helpers — as a shared
  library with **no VYRON COST-specific assumptions**. The two known repository-specific facts to
  parameterise: the tenancy column varies by table (`company_id`, except `vyron_documents` which
  uses `tenant_id`), and the storage bucket name is a constant in `src/lib/vyron-documents.ts`.
- Per-product asset registers and environment allowlists; one shared engine.
- Cross-product certification for shared platform code.
- **Before extending to any repository not evidenced here, run a Test Infrastructure Audit against
  it first.** **[INFERRED]** This audit's central lesson is that each prior conclusion was too
  narrow because it read fewer files than the question required. Applying a standard to a repository
  nobody has audited would repeat that error at organisational scale.

**Exit:** one safety substrate, adopted per product, with per-product policy and a shared engine.

---

# PART 13 — Remaining Unknowns

Stated so they are not later mistaken for settled facts. Each carries the decision it blocks.

**13.1 — Which Supabase project is production.**
`.env.local` → `bzzlhzgfvnnwxjxvpzdk`; `.env.example:13-14` and
`src/supabase/deploy/xero_deployment_baseline.sql:2` → `ldnrmgafsquzfitcuvxq`;
`deployment-gap-report.json:26` (2026-07-09) → the former.
*Blocks:* the risk rating of every Family B/C/D asset. *Resolvable in minutes.* **Phase 0, first
task.**

**13.2 — Whether the six Xero assets have been executed against a live organisation.**
The repository evidences capability and intent, not execution. There is no run log.
*Blocks:* whether §5.1 is a prevented risk or an incident requiring customer remediation.

**13.3 — Which Xero organisations are connected in the configured project.**
`tmp-xero-live-target-check.mjs` would answer it, but it is Family D by Rule 3 and quarantined in
Phase 0. The query itself is trivial and should be run by a person, once, with the result recorded.
*Blocks:* the scope of any Xero reconciliation.

**13.4 — Where `test-po-enterprise-hardening.mjs` sends email.**
Not traced into application source during the audit. The PO carries an `@example.com` supplier,
which *suggests* a sink or a bounce, **but this was not confirmed and must not be assumed.**
*Blocks:* the asset's family. Currently Family D, conservatively.

**13.5 — The Product Gap Register's actual contents.**
On unmerged branch `docs/product-gap-register`, not in this working tree. The gap analysis rests on
the entries cited in `PAT-ARCHITECTURE.md` §7 (GAP-001/002 supplier imports, GAP-003 error handling).
*Blocks:* Part 11's RSP ↔ Register interface.

**13.6 — Whether `run_sql` / `exec_sql` are exposed.**
`tmp-live-constraint-proof.mjs:64-72` probes for them. If either is reachable with the anon key, that
is a critical finding independent of this programme. *Blocks:* nothing — but it should be answered
in Phase 0 and recorded.

**13.7 — Whether `apps/vyron-ops-mobile` contains further validation assets.**
Not audited. It has its own `typecheck` script in `package.json`.
*Blocks:* completeness of the asset register.

**13.8 — Whether BUILD, SAFE and SURF4CARS exist as repositories.**
Named in the directive; no repository evidence (§Phase 5).
*Blocks:* Phase 5 scope.

**13.9 — Whether the two unauthenticated search endpoints are intended to be public.**
`test-intelligence-modules-certification.mjs:176,179` assert they are.
*Blocks:* whether this is a documented decision or an authentication gap the suite is locking in.
**A decision, not an investigation.**

---

# PART 14 — Executive Recommendations

**R1 — Authorise Phase 0 immediately; treat §13.1 and the Family D quarantine as same-day actions.**
Neither requires code change, both are reversible, and together they close the only two risks capable
of harming a party outside the engineering team. **[INFERRED]** Everything else in this programme is
improvement; these two are containment.

**R2 — Accept that PAT slips, and that this is the correct trade.**
`PAT-ARCHITECTURE.md` §8 P1 is not deliverable as scoped: its premise — that credential isolation
bounds the risk — does not hold for the six assets that select their target by database query and
whose harm is external (§1.2). Delivering P1 on the original premise would produce a guard that
reads as protection while leaving the critical path open. **The slip buys a correct foundation.**

**R3 — Preserve the suite. Do not rebuild it.**
54 assets, roughly 13,500 lines, covering procurement, manufacturing, inventory, permissions,
exports and administration at real depth, through real HTTP routes, asserting on real database
state. **[INFERRED]** The engineering instinct is sound; what is missing is everything around the
tests. 11 assets are close to ready and 19 need refactoring, not replacement. Only 6 require
rebuilding — and even there, the assertions should be preserved and the method replaced.

**R4 — Fund the shared loader as the first engineering task of Phase 1.**
The same 10-line preamble is duplicated 47 times. It is why no asset has a guard — there is no single
place to put one. It is also why the guard is cheap. **[INFERRED]** One module, imported 47 times,
makes every asset fail-closed simultaneously. The duplication that created the problem makes the fix
mechanical, and this will not remain true once the assets begin to diverge under refactoring.

**R5 — Adopt verification-of-cleanup as the standard's non-negotiable clause (§7.5).**
Every cleanup defect the audit found shares one property: **the code ran and nobody could tell it
had not worked.** The 2,000-user ceiling, the three-of-nine table teardown, the storage objects
surviving row deletion — all reported success. Verification converts a silent compounding defect into
a loud immediate one, and it is the single rule that would have surfaced all three.

**R6 — Rename by risk class, and treat naming as a control surface.**
**[VERIFIED]** `tmp-` marks 24 permanent, git-tracked files, six of which write to a live customer's
accounting system. **[INFERRED]** Reviewers discount anything named `tmp-`, which is why this family
went uncharacterised through prior investigations. A prefix encoding write behaviour makes risk
legible at `ls` time.

**R7 — Recognise that the multi-product blast radius is present, not prospective.**
`src/platform/products/registry.ts` registers five products sharing one credential set. **[INFERRED]**
RSP already governs five products; Phase 5's extraction work formalises what is already true rather
than extending scope. This raises the return on Phases 1–2 and should be weighed in prioritisation.

**R8 — Commission a Test Infrastructure Audit for any repository before extending RSP to it.**
**[INFERRED]** Three successive investigations of this repository each concluded something too
narrow, because each read fewer files than the question required — and the correction each time was
material, not marginal. Applying a standard to an unaudited repository would repeat that error at
organisational scale.

---

## Document status and limitations

**[VERIFIED]** Produced from `docs/TEST-INFRASTRUCTURE-AUDIT.md` plus targeted verification of
`src/platform/products/registry.ts`, `src/platform/products/*.ts`,
`.tmp-fg-cert/certify-fg-export.mjs`, and the VYRON product-module footprint under `src/`.

**Limitations.** No script was executed. No credential was decoded. No file was modified, removed,
committed, branched, merged or pushed. Nine assets over 380 lines were classified from full reads of
their head, credential resolution, tenant construction and cleanup, with targeted reads of the
assertion body — their **classification is fully evidenced; their assertion inventories may be
incomplete** (`TEST-INFRASTRUCTURE-AUDIT.md` §12.4). All items in Part 13 remain open.

*This document is untracked, as directed.*
