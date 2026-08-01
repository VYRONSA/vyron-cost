# Repository Safety Programme — `scripts/safety/`

Phase 1 of the RSP. This directory makes the safety properties of every
executable validation asset **visible before it runs**.

- **Why it exists:** [`docs/TEST-INFRASTRUCTURE-AUDIT.md`](../../docs/TEST-INFRASTRUCTURE-AUDIT.md)
- **What it is building toward:** [`docs/REPOSITORY-SAFETY-HARDENING-PLAN.md`](../../docs/REPOSITORY-SAFETY-HARDENING-PLAN.md)

> **Adoption is opt-in.** No validation asset has been modified. Invoked
> directly, every asset behaves exactly as it always has. The safety layer
> **composes around** assets via the wrapper — you choose to use it.

---

## Quick start

```bash
npm run safety:env                              # What environment am I in?
npm run safety:preflight -- test-permissions    # Is this asset safe to run?
npm run safety:run -- test-permissions --dry-run # Full safety pass, without invoking
npm run safety:register                         # What assets exist, and what are they?
npm run safety:verify-register                  # Is anything unclassified?
npm run safety:self-test                        # Do the safety tools themselves work?
```

`preflight` and `run` accept an id, a bare filename, or a repo-relative path:

```bash
npm run safety:preflight -- test-permissions
npm run safety:preflight -- test-permissions.mjs
npm run safety:preflight -- scripts/test-permissions.mjs
```

Add `--gate` to `preflight` to exit non-zero unless the verdict is `permitted`,
and `--json` for machine-readable output.

---

## The execution wrapper

`run.mjs` composes the whole safety layer around an **unmodified** asset:

```
load manifest → evaluate environment → banner → preflight
  → acknowledgement (Family D) → residue snapshot
  → invoke the asset → residue re-snapshot → safety report
  → return the asset's original exit code
```

```bash
node scripts/safety/run.mjs <asset> [options] [-- <args for the asset>]
```

| Option | Effect |
|---|---|
| `--dry-run` | Every safety step runs; the asset is **not** invoked |
| `--verify-cleanup` | Snapshot fixture residue before and after |
| `--strict-cleanup` | Exit non-zero if cleanup verification fails |
| `--report <path>` | Write the machine-readable safety report to a file |
| `--json` | Print the report to stdout instead of a banner |
| `--acknowledge <token>` | Family D acknowledgement token |
| `--approver <name>` | Named approver — required for Family C and D |

### Guarantees

- **The asset is never modified and never behaves differently.** `stdio` is
  inherited, so its stdout, stderr and stdin are exactly as when invoked
  directly. Every safety message goes to **stderr**, so an asset that emits JSON
  on stdout stays machine-readable.
- **The original exit code is returned verbatim.** This is a contract, and it
  creates a real tension: a cleanup failure found after a successful run cannot
  change the exit code without breaking it. The resolution — cleanup failure is
  always loud (banner + `status: FAIL` in the report) but only *fatal* under
  `--strict-cleanup`. The default honours the contract; the flag is for CI.
- **There is no bypass.** No `--force`. A prohibited asset stays prohibited.

### Assets the wrapper declines to invoke

Stated rather than attempted — a runner that silently half-works is worse than
one that refuses:

- **`.ts` assets** (2, both Family D) import via the `@/…` path alias, which
  Node's native type stripping does not resolve, and no TypeScript runner is
  declared in `package.json`. **Not verified to run under the wrapper.**
- **`.ps1` assets** (2) are Windows-specific; both are quarantined or dead.

---

## Family D — controlled execution

Family D assets are not modified and are not blocked outright. They require an
**explicit acknowledgement** whose purpose is to stop *accidental* execution,
not authorised execution.

```
##########################################################################
  FAMILY D — EXPLICIT ACKNOWLEDGEMENT REQUIRED
##########################################################################
  Asset:                    tmp-xero-integration-regression-probe
  Environment:              PAT
  Mutation capability:      EXTERNAL
  External integrations:    XERO
##########################################################################
  IRREVERSIBLE OPERATIONS — nothing in this repository can undo these:

    * Rotates the live OAuth refresh token. Xero refresh tokens are
    single-use; a failed write-back breaks the tenant's connection.
    * Runs sync-all-customers-now, sync-all-suppliers-now and
    sync-all-invoices-now — pushing every customer, supplier and invoice
    to the live organisation.
##########################################################################
  To proceed, supply BOTH:

    --acknowledge "RUN TMP-XERO-INTEGRATION-REGRESSION-PROBE AGAINST PAT WITH XERO"
    --approver <name>
```

**Why a typed token rather than a y/n prompt.** A y/n prompt is answered
reflexively and can be satisfied by a stray keystroke or a piped `yes`. The
token cannot be produced without reading the banner, and it is **bound to the
asset *and* the environment** — an acknowledgement typed for a PAT run does not
authorise the same asset elsewhere.

**Quarantine outranks acknowledgement.** The 8 quarantined assets are refused
before the acknowledgement gate is reached; no token unblocks them.

---

## Execution families

Every asset belongs to exactly one family. Two rules make the assignment
deterministic:

1. **Assignment is by maximum, not by purpose.** An asset belongs to the
   highest-risk family it qualifies for on *any* code path, including paths that
   run only on failure.
2. **Family D is defined by reversibility, not by vendor.** It is *not* "calls a
   third party". It is **mutates any system whose state cannot be restored by
   this repository's own database teardown** — which includes Supabase Storage.

| Family | Risk | Meaning | Permitted in |
|---|---|---|---|
| **A — Read-only** | SAFE | Queries and inspection only | All environments (redact output in Production) |
| **B — Ephemeral** | LOW | Creates a complete tenant and removes it | Development, PAT |
| **C — Persistent** | HIGH | Leaves data behind — by intent, omission, or an unhandled path | PAT only, with approval |
| **D — External** | CRITICAL | Mutates something this repository cannot reverse | PAT only, with approval and an allowlisted target |

Current population: **A: 15 · B: 8 · C: 17 · D: 10** (50 validation assets),
plus 4 non-validation tooling scripts.

**Family C is a defect classification, not a design.** It is transitional: every
Family C asset should become Family B by completing its teardown. Phase 2 does
that work.

---

## Reading the banner

```
##########################################################################
  REPOSITORY SAFETY PROGRAMME
##########################################################################
  Asset:                    tmp-product-overrides-only-cert
  Family:                   D — External
  Risk:                     CRITICAL
  Environment:              UNKNOWN  (confidence: none, 0/3 signals resolved)
  Evaluated as:             PRODUCTION  (Hardening Plan Rule 4)
  Mutation level:           EXTERNAL (mutates systems this repository cannot reverse)
  Authentication:           SERVICE ROLE + AUTHENTICATED USER + SYSTEM INTEGRATION
  External integrations:    XERO
  Cleanup:                  CANNOT REVERSE ITS EXTERNAL EFFECTS
##########################################################################
  VERDICT: PROHIBITED
```

Two deliberate properties:

- **No colour.** The banner is legible in a pipe, a log file and a CI transcript.
  Severity is carried by words and by the box rule (`-` safe, `=` caution,
  `#` danger), never by an escape sequence.
- **It goes to stderr.** Several assets emit JSON on stdout — the `tmp-*-cert`
  family prints a structured `{module, runtimeStep, rootCause, exactFile,
  smallestFix}` diagnostic meant to be machine-read. A banner on stdout would
  corrupt it.

### Verdicts

| Verdict | Meaning |
|---|---|
| `permitted` | The asset's family is allowed in the resolved environment |
| `requires-approval` | Allowed, but Family C/D needs a named approver per execution |
| `prohibited` | Not allowed here — quarantined, wrong environment, or mutating against an unidentified database |
| `unregistered` | Not in the register. Treated as unsafe, never as safe by default |

---

## Environment verification

**The rule: never infer the environment from a single indicator.**

The audit established two defects this closes:

1. `NEXT_PUBLIC_APP_URL` defaults to `http://localhost:3007` in 33 assets. If
   `.env.local` sets it to a deployed URL, all 33 silently retarget.
2. The database an asset connects to and the application it drives are
   configured independently, and **nothing asserts they agree** — an asset can
   validate against one environment while mutating another.

Three signals are resolved independently:

| Signal | Source | Resolves to |
|---|---|---|
| **1. Explicit declaration** | `VYRON_ENV` | The environment an engineer *intends* |
| **2. Database identity** | Supabase project ref from `NEXT_PUBLIC_SUPABASE_URL`, matched against `allowlist.json` | The environment the **data tier** is in |
| **3. Application target** | Host from `NEXT_PUBLIC_APP_URL`, matched against `allowlist.json` | The environment the **application tier** is in |

Confidence: `none` (0 resolved or any conflict) · `low` (1) · `medium` (2
agreeing) · `high` (3 agreeing). **Verified requires ≥ 2 agreeing signals** — one
is never enough.

Two rules layered on top:

- **Rule 4 — Unknown is treated as Production.** An unverified environment is
  *evaluated as* Production rather than refused outright. This is why a
  read-only probe stays runnable today while a write is correctly blocked.
- **Database identity is mandatory for mutating assets.** Two weak signals
  agreeing — a declared `VYRON_ENV` and a `localhost` app host — must not
  authorise a write while the database is unidentified. The app host describes
  the application tier only; a local dev server can be pointed at any database.

### Precedence

A value already in `process.env` **wins** over `.env.local`. The 46 assets under
`scripts/` overwrite unconditionally, which means an engineer cannot redirect
them from the shell and `VYRON_ENV` set in a terminal would be silently
discarded. This module does the opposite, matching
`.tmp-fg-cert/certify-fg-export.mjs:20`.

### Secret handling

`environment.mjs` reads `.env.local`, so it is careful about what it takes:

- It reads **values** only for `VYRON_ENV`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_APP_URL` and `PERMISSION_TEST_BASE`. None is a secret.
- For credentials it records **presence only** — never a value. Nothing here
  returns, logs or stores a secret.

### Why everything currently reports UNKNOWN

`allowlist.json` maps **both** Supabase project references to `unknown`, because
the repository does not establish which carries live customer data
(Hardening Plan, Unknown 13.1). That is not an oversight — it is what keeps the
tool fail-closed. Resolving it is a reviewed, one-file change; see the
`$comment` block in `allowlist.json`.

---

## Asset metadata

`manifest.mjs` holds one declaration per asset: family, risk, permitted
environments, authentication modes, mutation level, external integrations,
cleanup expectation, and the audit evidence for the classification. **The banner
and every verdict derive from it**, so they cannot drift from the classification.

### Why a central register rather than 50 file headers

Phase 1 forbids modifying validation assets — editing 50 files is exactly the
behavioural risk this phase is scoped to avoid. The register is still a single
declaration per asset.

`readInlineManifest()` additionally reads an optional `@vyron-safety` block from
an asset's own source, which **overrides** the register when present:

```js
/** @vyron-safety {"family":"B","mutation":"ephemeral","external":[],"cleanup":"complete"} */
```

This is the Phase 2 migration path: assets adopt inline declarations as they are
refactored for other reasons, with no change to any consumer.

### Keeping the register honest

`npm run safety:verify-register` compares the register against what is on disk
and **exits non-zero on drift**. A new validation asset that has not been
classified is invisible to every other control in the programme, so this is the
Phase 1 merge gate.

---

## Cleanup verification

**Verify — do not assume — that cleanup succeeded.**

Every cleanup defect the audit found shares one property: the cleanup code ran,
and the engineer had no way to know it had not worked.

- `test-companies-module-certification.mjs` resolves users by scanning paginated
  `auth.admin.listUsers`, capped at 2,000, returning silently past that. Beyond
  2,000 auth users an active `PLATFORM_ADMIN` survives — and the script reports
  success.
- `test-manufacturing-lifecycle-enterprise.mjs` deletes 3 rows while creating
  production runs, run lines, an audit log, products, stock items and finished
  goods. The orphans point at a deleted company and are invisible to every
  tenant-scoped query.
- `test-po-enterprise-hardening.mjs` deletes `vyron_documents` **rows**, which
  cannot remove the storage object they referenced.

All three exited 0.

### Usage

```js
import { createCleanupTracker } from "./safety/cleanup-verify.mjs";

const tracker = createCleanupTracker({
  client: supabase,                       // injected — this module holds no credentials
  label: "procurement-workflow",
  ledgerPath: ".safety-ledger/run.jsonl", // optional; append-only, flushed per entry
});

// Register BEFORE the call that creates the artefact.
tracker.trackRow("vyron_cost_companies", "id", companyId);
tracker.trackRow("vyron_documents", "tenant_id", companyId);   // scope column is explicit
tracker.trackAuthUser(userId);
tracker.trackStorageObject("vyron-documents", storagePath);
tracker.trackExternal("xero", xeroInvoiceId);

// ... run the scenario, then tear down as usual ...

const report = await tracker.verify();   // advisory: returns a report
// or
await tracker.assertClean();             // fails the process if anything survived
```

**Register-then-create is deliberate.** A crash between the two leaves a false
positive — a ledger entry for something never created — which reconciliation
discards harmlessly. Create-then-register leaves an orphan nothing knows about,
which is the failure being prevented.

### Outcomes

| Outcome | Meaning |
|---|---|
| `removed` | Confirmed absent |
| `RESIDUAL` | Confirmed still present — a cleanup failure |
| `INDETERMINATE` | The check itself failed. **Not evidence of cleanliness** |
| `UNVERIFIABLE` | External; this repository cannot confirm either way |

`clean` is **strict**: it requires every artefact to be *confirmed removed*, so an
unverifiable external artefact makes a run not-clean. Reporting a Xero invoice as
cleaned up because this repository cannot see it would be exactly the false
assurance this module exists to remove. `databaseClean` is the narrower claim,
and `requiresManualReconciliation` flags the rest.

Every residual carries an actionable remediation — the SQL or the API call that
removes it.

---

## Fixture residue verification

**Verifying an asset's *existing* cleanup, without modifying it.**

Every ephemeral-tenant asset names the company it creates with a literal prefix
— `Perm Co `, `Proc Test `, `Warehouse Cert `. Those prefixes are recorded in
`FIXTURE_PATTERNS` (in `manifest.mjs`), each read directly out of the asset's own
`.insert({ name: … })` call. The wrapper counts matching rows before the run and
again after, and compares.

| Delta | Status | Meaning |
|---|---|---|
| `> 0` | `RESIDUE` | Cleanup did not remove everything — strong evidence of failure |
| `0` | `VERIFIED` | No tenant survived under the known pattern |
| `< 0` | `ANOMALY` | Rows vanished that this run did not create — investigate |
| count failed | `INDETERMINATE` | **Not** evidence of a clean run |
| no pattern declared | `NO_PATTERN` | Cleanup is unverifiable for this asset |

**What a `VERIFIED` result does not prove.** A zero delta shows no *tenant*
survived. It says nothing about orphaned child rows whose parent company was
deleted — the exact defect in `test-manufacturing-lifecycle-enterprise` — because
once the company row is gone those rows are unreachable from any pattern. The
report prints this caveat every time it reports `VERIFIED`.

One pattern is flagged **ambiguous**: `test-manage-login` names its company the
constant `Broken Login Co` with no run stamp, so residue from separate runs is
indistinguishable and a zero delta proves less than usual.

For assets that adopt the tracker directly, `cleanup-verify.mjs` offers the
stronger, artefact-level check — see below.

---

## Machine-readable safety report

Foundation for future PAT dashboards. `--json`, or `--report <path>`:

```json
{
  "schemaVersion": 1,
  "asset": "test-permissions.mjs",
  "family": "B",
  "environment": "PAT",
  "environmentVerified": true,
  "effectiveEnvironment": "PAT",
  "risk": "LOW",
  "cleanup": "VERIFIED",
  "externalIntegrations": [],
  "exitCode": 0,
  "status": "PASS"
}
```

Three deliberate properties:

1. **`cleanup` distinguishes `VERIFIED` from `NOT_VERIFIED` from `NO_PATTERN`
   from `NOT_CHECKED`.** An asset whose residue was never checked reports
   `NOT_CHECKED`, never `VERIFIED`.
2. **`status` is `PASS` only when the asset exited 0 *and* cleanup did not
   fail.** A green exit code with surviving residue is not a pass.
3. **`environment` records what was resolved, with confidence**, alongside
   `effectiveEnvironment` after Rule 4. A dashboard must never show `PAT` for a
   run whose environment was never proven.

---

## Adding a new validation asset safely

1. **Check whether one already exists** — `npm run safety:register`. The audit
   found five separate duplications caused by assets nobody could discover.
2. **Classify it in `manifest.mjs`.** Family (by maximum, and by reversibility),
   purpose, authentication, mutation, external integrations, cleanup
   expectation, and the evidence for the classification.
3. **Declare a fixture pattern** in `FIXTURE_PATTERNS` if it creates tenants —
   otherwise its cleanup can never be verified.
4. **If it is Family D**, record its irreversible operations in
   `IRREVERSIBLE_OPERATIONS`. The acknowledgement gate has nothing to show
   without them, and an asset with none recorded is treated as *unknown*, not as
   safe.
5. **Confirm registration:** `npm run safety:verify-register` — exits non-zero if
   anything on disk is unclassified.
6. **Run it through the wrapper**, not directly.

`scripts/safety/` is deliberately **excluded** from the register: it is the
classifier, and classifying it inside its own register is circular. The
exclusion is named in `preflight.mjs` and reported by `--verify-register` so it
reads as a decision, not an oversight.

---

## Files

| File | Purpose |
|---|---|
| `manifest.mjs` | Asset register, fixture patterns, irreversible operations |
| `environment.mjs` | Environment verification — the single implementation |
| `banner.mjs` | Execution banner rendering |
| `cleanup-verify.mjs` | Artefact-level cleanup verification (opt-in, for assets that adopt it) |
| `residue.mjs` | Fixture residue verification (black-box, no asset changes) |
| `acknowledge.mjs` | Family D acknowledgement |
| `report.mjs` | Machine-readable safety report |
| `run.mjs` | Execution wrapper |
| `preflight.mjs` | Inspection CLI |
| `self-test.mjs` | 124 checks — no DB, no credentials, no network |
| `allowlist.json` | Environment allowlist — **currently unresolved by design** |

---

## What this does not do

Stated so nothing here is mistaken for a protection that exists:

- **Nothing is enforced on direct invocation.** No validation asset was
  modified. `node scripts/test-permissions.mjs` still runs exactly as before —
  the wrapper must be chosen.
- **Which Supabase project is production is still unresolved** (Unknown 13.1),
  which is why every signal reads UNRESOLVED today.
- **Quarantine is metadata, not a file lock.** The register marks 8 assets and
  the wrapper refuses them, but the files remain executable directly.
- **No credential has been removed**, no Xero script rewritten, no
  authentication changed, no cleanup logic redesigned. Those are later phases.
- **Residue verification is black-box.** It detects surviving tenants, not
  orphaned child rows. Artefact-level verification requires an asset to adopt
  the tracker, which is opt-in.
