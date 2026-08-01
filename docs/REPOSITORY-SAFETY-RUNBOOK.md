# VYRON — Repository Safety Runbook

**Audience:** every engineer working in this repository, including on day one.
**Status:** operational. Everything marked **[IMPLEMENTED]** works today and has been verified.
**Scope:** how to run validation assets safely. Not how the framework was built.

| Label | Meaning |
|---|---|
| **[IMPLEMENTED]** | Works today. Verified by execution. |
| **[RECOMMENDED NEXT]** | Should be adopted now. Needs no framework change. |
| **[FUTURE]** | Roadmap. Requires a later phase. |

Related: [`REPOSITORY-SAFETY-GOVERNANCE.md`](REPOSITORY-SAFETY-GOVERNANCE.md) (adoption, ownership,
metrics) · [`TEST-INFRASTRUCTURE-AUDIT.md`](TEST-INFRASTRUCTURE-AUDIT.md) (what each asset does) ·
[`REPOSITORY-SAFETY-HARDENING-PLAN.md`](REPOSITORY-SAFETY-HARDENING-PLAN.md) (why the rules are what
they are).

---

## 1. Purpose

`scripts/` holds **50 executable validation assets**. They are not tests in the usual sense: there
is no runner, no CI, and only three are registered as npm scripts. Several of them write to a
database, and ten of them mutate systems this repository cannot reverse.

Three facts, established by full inspection of all 54 assets, are why this runbook exists:

1. **No asset can tell which database it is connected to.** All 47 database-touching assets
   hand-parse `.env.local` and authenticate with the service-role key, which bypasses Row-Level
   Security. None validates the resolved host.
2. **The `tmp-` prefix means nothing.** All 24 `tmp-*` files are git-tracked and permanent. Six of
   them write to a live customer's Xero accounting system.
3. **Cleanup is inconsistent.** 8 assets tear down completely, 17 partially or not at all. `finally`
   does not run on `Ctrl-C` or on `process.exit()` inside a `try` — and several assets call exactly
   that.

The safety layer does not fix these. It makes them **visible before you run something**.

---

## 2. The 60-second version

```bash
npm run safety:env                                    # Where am I actually pointed?
npm run safety:run -- <asset> --dry-run               # What would this asset do?
npm run safety:run -- <asset>                         # Run it, wrapped
```

If you read nothing else: **run mutating assets through the wrapper, and never run anything whose
banner you have not read.**

---

## 3. Direct execution vs wrapped execution

Both work. They are not equivalent.

| | Direct — `node scripts/x.mjs` | Wrapped — `npm run safety:run -- x` |
|---|---|---|
| Asset behaviour | Unchanged | **Unchanged** — stdio inherited, exit code preserved verbatim |
| Environment check | None | Three signals, with a verdict |
| Banner | None | Family, risk, mutation, auth, external integrations |
| Family D acknowledgement | None | Required |
| Cleanup verification | None | Optional (`--verify-cleanup`) |
| Safety report | None | Always |

**[IMPLEMENTED]** No validation asset was modified, and none imports the safety layer — verified by
search. The wrapper composes around assets from the outside, so direct invocation is byte-for-byte
what it always was.

### When to use the wrapper

| Situation | Use |
|---|---|
| The asset mutates anything (Family B, C, D) | **Wrapper. Always.** |
| You are recording a result as evidence | Wrapper — the safety report is the evidence |
| You are unsure what the asset does | Wrapper with `--dry-run` |
| Read-only schema probe, exploratory | Direct is fine |
| The asset is quarantined | Neither. It is prohibited. |

---

## 4. Reading the execution banner

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

Two properties worth knowing:

- **No colour.** Severity is carried by words and by the box rule — `-` safe, `=` caution, `#`
  danger. The banner is legible in a pipe, a log file and a CI transcript.
- **It is on stderr.** Several `tmp-*-cert` assets emit machine-readable JSON on stdout. The banner
  never touches stdout, so `node scripts/safety/run.mjs x --json | jq` still works.

### Verdicts

| Verdict | Meaning | What to do |
|---|---|---|
| `PERMITTED` | Family allowed in the resolved environment | Proceed |
| `REQUIRES NAMED APPROVER` | Family C or D | Supply `--approver`, and for D an `--acknowledge` token |
| `PROHIBITED` | Quarantined, wrong environment, or mutating against an unidentified database | Read the reason. Do not look for a bypass — there isn't one |
| `BLOCKED — ASSET NOT REGISTERED` | Not in the register | Classify it first (§8) |

---

## 5. Execution families

Two rules decide which family an asset belongs to:

1. **Assignment is by maximum, not by purpose.** An asset belongs to the highest-risk family it
   qualifies for on *any* code path — including paths that only run on failure.
2. **Family D is defined by reversibility, not by vendor.** Not "calls a third party" but **mutates
   any system whose state cannot be restored by this repository's own database teardown** — which
   includes Supabase Storage.

| Family | Risk | Count | Meaning | Permitted in |
|---|---|---|---|---|
| **A — Read-only** | SAFE | 15 | Queries and inspection only | All (redact output in Production) |
| **B — Ephemeral** | LOW | 8 | Creates a whole tenant, removes it | Development, PAT |
| **C — Persistent** | HIGH | 17 | Leaves data behind | PAT only, with approval |
| **D — External** | CRITICAL | 10 | Mutates what cannot be reversed | PAT only, approval + allowlisted target |

**Family C is a defect classification, not a design.** It is transitional — an asset is in C because
its teardown is incomplete, and the fix is to complete the teardown, not to argue the classification.

```bash
npm run safety:register        # every asset, with family, mutation, cleanup, external systems
```

### Family D — what to expect

Family D assets are not blocked outright. They require a **typed acknowledgement** naming what
cannot be undone:

```
  IRREVERSIBLE OPERATIONS — nothing in this repository can undo these:

    * Rotates the live OAuth refresh token. Xero refresh tokens are
    single-use; a failed write-back breaks the tenant's connection.
    * Runs sync-all-customers-now, sync-all-suppliers-now and
    sync-all-invoices-now — pushing every customer, supplier and invoice
    to the live organisation.

  To proceed, supply BOTH:
    --acknowledge "RUN TMP-XERO-INTEGRATION-REGRESSION-PROBE AGAINST PAT WITH XERO"
    --approver <name>
```

The token is **bound to the asset and the environment** — one typed for PAT does not authorise the
same asset elsewhere. A `y/n` prompt was rejected deliberately: it is answered reflexively and can be
satisfied by a piped `yes`.

**Quarantine outranks acknowledgement.** 8 assets are refused before the gate is reached. No token
unblocks them.

---

## 6. Environment verification

**The rule: never infer the environment from a single indicator.**

Three signals resolve independently:

| Signal | Source | Tells you |
|---|---|---|
| **1. Declaration** | `VYRON_ENV` | What an engineer *intended* |
| **2. Database identity** | Supabase project ref from `NEXT_PUBLIC_SUPABASE_URL`, matched against `scripts/safety/allowlist.json` | Which environment the **data tier** is in |
| **3. Application target** | Host from `NEXT_PUBLIC_APP_URL`, matched against the same allowlist | Which environment the **application tier** is in |

Confidence: `none` (0 resolved, or any conflict) · `low` (1) · `medium` (2 agreeing) · `high` (3
agreeing). **Verified requires at least two agreeing signals.**

Two rules sit on top:

- **Rule 4 — Unknown is treated as Production.** An unverified environment is *evaluated as*
  Production rather than refused outright. This is why a read-only probe stays runnable today while
  a write is correctly blocked.
- **Database identity is mandatory for mutating assets.** A declared `VYRON_ENV` plus a `localhost`
  app host is not enough to authorise a write. The app host describes the application tier only —
  a local dev server can be pointed at any database.

### Why everything currently says UNKNOWN

**[IMPLEMENTED, and deliberate.]** `allowlist.json` maps **both** Supabase project references to
`unknown`:

- `.env.local` points at `bzzlhzgfvnnwxjxvpzdk`
- `.env.example:13-14` documents production as `ldnrmgafsquzfitcuvxq`

The repository does not establish which carries live customer data. Until an authorised person
resolves it, `unknown` is the only evidence-based value — and Rule 4 keeps the framework fail-closed
in the meantime.

**[RECOMMENDED NEXT]** Resolving it is a reviewed, one-file change. See the `$comment` block in
`scripts/safety/allowlist.json`. It takes minutes and it unblocks the entire Family B population.

---

## 7. Cleanup verification

Two mechanisms. Know which one you are using.

### 7.1 Fixture residue — black-box, no asset change **[IMPLEMENTED]**

```bash
npm run safety:run -- test-permissions --verify-cleanup
```

Every ephemeral-tenant asset names the company it creates with a literal prefix — `Perm Co `,
`Proc Test `, `Warehouse Cert `. Those 28 prefixes were read directly out of each asset's own
`.insert({ name: … })` call. The wrapper counts matching rows before and after.

| Result | Meaning |
|---|---|
| `RESIDUE` | Rows survive. Strong evidence of a cleanup failure |
| `VERIFIED` | No tenant survived under the known pattern |
| `ANOMALY` | Rows vanished that this run did not create — investigate |
| `INDETERMINATE` | A count failed. **Not evidence of a clean run** |
| `NO_PATTERN` | No pattern declared; cleanup is unverifiable for this asset |

**What `VERIFIED` does not prove.** A zero delta shows no *tenant* survived. It says nothing about
orphaned child rows whose parent company was deleted — the exact defect in
`test-manufacturing-lifecycle-enterprise`, where teardown removes 3 rows while the asset created
production runs, run lines, an audit log, products, stock items and finished goods. Once the company
row is gone those orphans are unreachable from any pattern. The report prints this caveat every time.

One pattern is flagged **ambiguous**: `test-manage-login` names its company the constant
`Broken Login Co` with no run stamp, so residue from separate runs is indistinguishable.

### 7.2 Artefact-level tracking — opt-in, requires an asset change **[FUTURE]**

`scripts/safety/cleanup-verify.mjs` offers the stronger check: register each artefact before creating
it, then re-query every one and assert absence. It handles rows (with an explicit scope column —
`vyron_documents` uses `tenant_id`, not `company_id`), auth users, storage objects, and external
artefacts.

**No asset uses it yet.** Adopting it means editing validation assets, which is a later phase.

---

## 8. Safety reports

Every wrapped run produces one, whether it executed or was blocked.

```bash
npm run safety:run -- <asset> --json                    # to stdout
npm run safety:run -- <asset> --report evidence/run.json # to a file
```

```json
{
  "schemaVersion": 1,
  "asset": "test-permissions.mjs",
  "family": "B",
  "risk": "LOW",
  "environment": "UNKNOWN",
  "environmentVerified": false,
  "effectiveEnvironment": "PRODUCTION",
  "cleanup": "NOT_CHECKED",
  "externalIntegrations": [],
  "exitCode": null,
  "status": "BLOCKED"
}
```

Three things the report will never do:

1. **Report `cleanup: VERIFIED` for a check that did not run.** Unchecked is `NOT_CHECKED`;
   undeclared is `NO_PATTERN`.
2. **Report `status: PASS` for a green exit code with surviving residue.** That is `FAIL`.
3. **Show an environment it did not establish.** `environment` is what resolved;
   `effectiveEnvironment` is what policy applied after Rule 4.

---

## 9. Common workflows

### 9.1 Developing a new validation asset

1. **Check one does not already exist** — `npm run safety:register`. The audit found five separate
   duplications, caused by assets nobody could discover.
2. **Write it.** Follow the ephemeral-tenant pattern: create your own company, workspace, user and
   membership; drive the scenario through the real HTTP API; tear everything down in `finally`.
   `scripts/test-branches-warehouses-module-certification.mjs` is the reference — its
   `cleanupWorkspace` clears 29 tables in foreign-key order.
3. **Classify it** in `scripts/safety/manifest.mjs`: family, purpose, authentication, mutation,
   external integrations, cleanup expectation, and the evidence for the classification.
4. **Declare a fixture pattern** in `FIXTURE_PATTERNS` if it creates tenants — without one its
   cleanup can never be verified.
5. **If Family D**, record its irreversible operations in `IRREVERSIBLE_OPERATIONS`. The
   acknowledgement gate has nothing to show without them, and an asset with none recorded is treated
   as *unknown*, not as safe.
6. **Confirm registration:** `npm run safety:verify-register` — exits non-zero if anything on disk is
   unclassified.
7. **Run it through the wrapper**, not directly.

### 9.2 Modifying an existing validation asset

1. `npm run safety:preflight -- <asset>` — know its current classification before you touch it.
2. Make the change.
3. **Re-check the classification.** Adding a single `.insert(` moves an asset from Family A to B.
   Adding an outbound call to a third party moves it to D.
4. Update the register entry, including the `evidence` field, and the fixture pattern if the fixture
   naming changed.
5. `npm run safety:verify-register`.

### 9.3 Executing validation

```bash
npm run safety:env                                   # 1. confirm where you are
npm run safety:run -- <asset> --dry-run              # 2. confirm what it will do
npm run safety:run -- <asset> --verify-cleanup       # 3. run it
```

For Family C: add `--approver <name>`.
For Family D: add `--approver <name>` and `--acknowledge "<exact token from the banner>"`.

To pass arguments through to the asset itself, put them after `--`:

```bash
node scripts/safety/run.mjs visual-capture -- http://localhost:3007
```

### 9.4 Verifying cleanup

Use `--verify-cleanup`. Then read the result honestly:

- `RESIDUE` → the asset leaked. The report includes the SQL to find the survivors.
- `INDETERMINATE` → treat as residue until proven otherwise.
- `VERIFIED` → no tenant survived. **Not** proof of a clean run (§7.1).

### 9.5 Documenting a new asset

The register entry **is** the documentation. Its `purpose` and `evidence` fields are what the next
engineer reads. Do not maintain a second list — `scripts/README.md` deliberately points at the
manifest rather than duplicating it, because a duplicate drifts.

### 9.6 Updating the manifest

`scripts/safety/manifest.mjs` is the single source of truth. Inline `@vyron-safety` headers exist as
an **override mechanism only** — no repository-wide migration is authorised, and the central manifest
remains authoritative by architectural decision.

### 9.7 Reviewing safety reports

Read in this order:

1. `status` — `PASS`, `FAIL`, `BLOCKED`, `DRY_RUN`
2. `environmentVerified` — if `false`, the run proves less than it appears to
3. `cleanup` — `VERIFIED` is the only value that means anything was checked and passed
4. `reasons` — why the verdict was reached

---

## 10. Troubleshooting

**"Everything says UNKNOWN / 0 of 3 signals resolved."**
Expected today. Both Supabase project references are unresolved in the allowlist (§6). This is
deliberate, not broken.

**"My Family B asset is PROHIBITED, but I set `VYRON_ENV=development`."**
A declaration plus a localhost app host is two signals, but the *database* is still unidentified,
and database identity is mandatory for anything that mutates. Resolve the allowlist entry.

**"The wrapper refuses my `.ts` asset."**
The two `.ts` assets import via the `@/…` path alias, which Node's native type stripping does not
resolve, and no TypeScript runner is declared in `package.json`. The wrapper declines rather than
half-running them. Invoke directly if you have verified it works, and record the result.

**"`cleanup: NOT_CHECKED`."**
You did not pass `--verify-cleanup`, or the asset does not mutate, or no Supabase client could be
constructed.

**"`cleanup: NO_PATTERN`."**
The asset has no entry in `FIXTURE_PATTERNS`. Six mutating assets are in this state. Add one.

**"My asset is BLOCKED — ASSET NOT REGISTERED."**
Classify it in `manifest.mjs`. An unregistered asset is treated as unsafe, never as safe by default.

**"The banner is polluting my JSON output."**
It is not — the banner is on stderr. Use `2>/dev/null`, or `--json` for the report only.

**"The exit code differs from running directly."**
It should not. The only case is `--strict-cleanup`, which deliberately overrides the asset's exit
code when cleanup verification fails.

**"Residue reports ANOMALY."**
Rows matching the pattern disappeared during your run that your run did not create. Someone or
something else is deleting matching rows. Investigate before trusting any result from that
environment.

**"`npm run safety:run -- x --dry-run` ignores my flags."**
npm needs the `--` separator before the script's own arguments. Both of these work:

```bash
npm run safety:run -- <asset> --dry-run
node scripts/safety/run.mjs <asset> --dry-run
```

**"I need to run a quarantined asset."**
There is no bypass, and that is deliberate. Quarantine is a programme-level decision recorded in the
register; changing it is a reviewed change to `manifest.mjs`, not a runtime flag.

---

## 11. Command reference

| Command | Purpose |
|---|---|
| `npm run safety:env` | Environment report and signal breakdown |
| `npm run safety:register` | Every asset with family, mutation, cleanup, external systems |
| `npm run safety:verify-register` | Detect unclassified assets. Exits non-zero on drift |
| `npm run safety:preflight -- <asset>` | Inspect one asset without running it |
| `npm run safety:preflight -- <asset> --gate` | As above, exit non-zero unless permitted |
| `npm run safety:run -- <asset>` | Wrapped execution |
| `npm run safety:self-test` | 124 checks over the framework itself. No DB, no credentials, no network |

Wrapper flags: `--dry-run` · `--verify-cleanup` · `--strict-cleanup` · `--report <path>` · `--json`
· `--acknowledge <token>` · `--approver <name>`.

Asset references accept an id, a bare filename, or a repo-relative path:
`test-permissions` · `test-permissions.mjs` · `scripts/test-permissions.mjs`.
