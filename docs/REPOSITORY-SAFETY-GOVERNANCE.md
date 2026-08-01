# VYRON — Repository Safety Governance

**Audience:** engineering leads, reviewers, release managers.
**Status:** governance artefact for the operational phase of the Repository Safety Programme.
**Scope:** adoption, ownership, review expectations, approvals, change management, metrics.

**Ownership boundary.** This document owns **only the Repository Safety slice** of the development
lifecycle. `docs/REPOSITORY-GOVERNANCE.md` — specified in `PAT-ARCHITECTURE.md` §7 and **not yet
created, awaiting an Executive Merge Decision** — will own merge order, generated-artefact handling
and the Automated Refactoring Standards. This document is written to be **absorbed into it as a
section**, not to pre-empt it.

| Label | Meaning |
|---|---|
| **[IMPLEMENTED]** | In place today, verified |
| **[RECOMMENDED NEXT]** | Adopt now; needs no framework change |
| **[FUTURE]** | Requires a later phase |

---

## 1. Responsibilities

| Role | Owns |
|---|---|
| **Engineer** | Classifying every asset they create or modify. Running mutating assets through the wrapper. Reading the banner before proceeding. Reporting residue rather than leaving it |
| **Reviewer** | Confirming the register entry matches the code. Challenging a family assignment that looks optimistic. Refusing a change that adds an unclassified executable |
| **Engineering lead** | Owning the Family C backlog and its target dates. Approving Family C and D executions. Approving allowlist changes |
| **Release manager** | Confirming no unsafe asset is executable in a release. Retaining safety reports as evidence |
| **Programme owner (RSP)** | The register, quarantine decisions, and the classification rules themselves |

**One rule matters more than the rest:** *the engineer who writes an asset classifies it.* Anyone
else is guessing, and the audit found five duplicated assets because classification was nobody's job.

---

## 2. When a Repository Safety review is mandatory

**[RECOMMENDED NEXT]** A change requires an explicit safety review when **any** of these is true:

| Trigger | Why |
|---|---|
| A new executable is added under `scripts/` or `.tmp-fg-cert/` | An unclassified asset is invisible to every control in the programme |
| An existing asset gains `.insert(`, `.update(`, `.delete(`, `.upsert(`, `.rpc(` or `.storage` | A single added write moves an asset from Family A to Family B |
| An asset gains an outbound call to a third party | Moves it to Family D — the only family that can cause irreversible harm |
| A register entry changes family, mutation, external integrations or quarantine | These are the fields every gate reads |
| `scripts/safety/allowlist.json` changes | It converts the repository from fail-closed to operational |
| Anything under `scripts/safety/` changes | It is the classifier |

**Not mandatory** for: changing an asset's assertions without changing what it writes; editing a
`purpose` or `evidence` string; adding a fixture pattern.

### The mechanical check

**[IMPLEMENTED]** `npm run safety:verify-register` exits non-zero when anything on disk is
unclassified. It is the cheapest possible gate and it prevents the population regressing while the
backlog is worked.

**[RECOMMENDED NEXT]** Make it a required step in the pull-request checklist. **[FUTURE]** Automate
it — CI is explicitly out of scope for this phase.

---

## 3. Approval requirements

| Family | Approval | Recorded as |
|---|---|---|
| **A** | None | — |
| **B** | None in Development/PAT | Safety report |
| **C** | **Named approver per execution** (`--approver`) | Safety report `acknowledgement.approver` |
| **D** | **Named approver + typed acknowledgement** naming the asset and environment | Safety report `acknowledgement.approver` and `.token` |

**Quarantine outranks approval.** The 8 quarantined assets cannot be authorised by any approver at
runtime. Lifting a quarantine is a reviewed change to `manifest.mjs`, owned by the programme owner.

**There is no bypass at any level, deliberately.** A `--force` flag would be used in exactly the
circumstances the framework exists for.

---

## 4. Change management

| Change | Path |
|---|---|
| New validation asset | Classify → `verify-register` → review → merge |
| Family reclassification | Update `evidence` to say *why*. A family change is a risk change and is reviewed as one |
| Quarantine lift | Programme owner only, with the remediation that justifies it |
| **Allowlist resolution** | **Reviewed like a permission change** — it is the single change that moves the repository from fail-closed to operational |
| Framework change | Only when driven by real operational experience. See §7 |

---

## 5. Adoption plan

**This is a plan. No asset is migrated by this phase, and none has been modified.**

Categories derived mechanically from the register (`npm run safety:register --json`), not by hand.

### 5.1 Always through the wrapper — **34 assets**

Every asset whose `mutation` is not `none`: Family **B (8)**, **C (17)**, and the **9 mutating**
Family D assets.

*Rationale:* these are the assets that can leave the repository in a different state than they found
it. The banner, the environment verdict and the safety report are the whole value of the framework
for them.

**[RECOMMENDED NEXT]** Adopt immediately. Requires no change to any asset.

### 5.2 May continue to run directly — **14 assets**

Family A, excluding the dead `tmp-run-marker.ps1`: the 13 read-only database probes plus
`visual-capture.mjs`.

*Rationale:* they cannot mutate anything. Wrapping them is **recommended when the result is being
recorded as evidence**, because the safety report captures which environment the reading came from —
which is exactly the provenance question a schema-drift result needs to answer.

**One caveat, and it is not optional:** Family A output must be redacted in Production. The wrapper
prints this reason automatically. `tmp-xero-live-target-check.mjs` is read-only by mechanism but is
**Family D** by the reconnaissance rule — it enumerates which customers hold live Xero credentials
— and must not be run directly.

### 5.3 Requiring future integration — **8 assets**

Blocked from full wrapper integration by a specific, named gap:

| Asset | Gap |
|---|---|
| `.tmp-fg-cert/certify-fg-export.mjs` | No fixture pattern — it operates in a pre-existing tenant, so there is no company name to count |
| `tmp-enterprise-financial-certification.mjs` | No fixture pattern (hijack pattern) |
| `tmp-enterprise-financial-full-certification.mjs` | No fixture pattern (hijack pattern) |
| `tmp-xero-integration-regression-probe.mjs` | No fixture pattern (hijack pattern) |
| `tmp-invoice-export-mapping-cert.ts` | No fixture pattern **and** no verified `.ts` runner |
| `tmp-preview-e2e.ps1` | No fixture pattern **and** no verified `.ps1` runner |
| `tmp-product-overrides-runtime-cert.ts` | No verified `.ts` runner |
| `tmp-run-marker.ps1` | No verified `.ps1` runner (dead; retire instead) |

*Note the pattern:* the assets that cannot have their cleanup verified are, with one exception,
**the same assets that operate inside a tenant they did not create.** They have no fixture of their
own to count. That is a property of the hijack design, not a gap in the framework, and it is fixed
by rebuilding them (§5.4), not by extending the verifier.

### 5.4 Should eventually be retired or replaced

Per `TEST-INFRASTRUCTURE-AUDIT.md` §6, unchanged by this phase:

| Disposition | Count | Notes |
|---|---|---|
| **Replace entirely** | 6 | The Xero family. Their *assertions* are valuable and must be preserved; their *method* — target discovery by database query — is not correctable by patching |
| **Retire** | 15 | 8 overlapping schema probes; 2 querying blocked catalog interfaces; 3 one-time discovery probes (**record the answers first**); `tmp-run-marker.ps1`; `tmp-preview-e2e.ps1` (**purge**, not merely retire — it carries a committed session credential) |

**[FUTURE]** Retirement and replacement belong to later phases. Nothing is removed by this one.

---

## 6. Operational metrics

**No telemetry is implemented, and none is authorised by this phase.** These are definitions, with
the decision each one informs.

Every metric below is derivable from the safety report already produced by each wrapped run
(`schemaVersion: 1`), which is why they can be defined without adding framework features.

### 6.1 Adoption

| Metric | Source | Why it matters |
|---|---|---|
| **Wrapped executions** | Count of safety reports | The programme's adoption rate. Without it, every other metric is measured over an unknown denominator |
| **Direct executions** | **Not measurable** | Stated so it is not assumed. Direct invocation produces no artefact — deliberate, since coupling assets to the framework is what Phase 2 avoided. **Infer** adoption from wrapped-execution trend, never claim a direct-execution count |
| **Assets never wrapped** | Register minus asset ids seen in reports | Identifies where the runbook is not landing |

### 6.2 Safety

| Metric | Source | Why it matters |
|---|---|---|
| **Prohibited executions** | `status: BLOCKED`, `verdict: prohibited` | The framework doing its job. A *rising* count is good early (it means people are trying the wrapper) and bad later (it means the environment is still unresolved) |
| **Environment mismatches** | `report.disagreements` non-empty | Signal disagreement, especially split-target. **Any** occurrence deserves investigation — it means the database and the application resolved to different environments |
| **Unverified-environment executions** | `environmentVerified: false` with `outcome: executed` | How often work proceeds on an unproven environment. Should trend to zero once the allowlist is resolved |
| **Family D acknowledgements** | `acknowledgement.token` non-null | Every irreversible external operation, with its approver. The audit could not establish whether these assets had ever been run (Unknown 13.2). **This metric ensures that question is never unanswerable again** |

### 6.3 Cleanup quality

| Metric | Source | Why it matters |
|---|---|---|
| **Residue detections** | `cleanup: NOT_VERIFIED` with `cleanupDetail.status: RESIDUE` | Direct measure of the leak. Also the evidence that moves an asset from Family C to B once it reaches zero |
| **Cleanup failures per asset** | Grouped by `assetId` | Ranks the Family C remediation backlog by observed harm rather than by guess |
| **Indeterminate verifications** | `cleanupDetail.status: INDETERMINATE` | A verifier that cannot answer is a broken control. Should be near zero |
| **Unverifiable assets** | `cleanup: NO_PATTERN` | Tracks §5.3 shrinking |
| **Residue anomalies** | `cleanupDetail.status: ANOMALY` | Rows disappearing that the run did not create. Rare and always worth investigating |

### 6.4 Programme health

| Metric | Source | Why it matters |
|---|---|---|
| **Register drift** | `safety:verify-register` exit code | Should be permanently zero |
| **Family distribution over time** | `familyCounts()` | The programme's actual goal is **C → B**. A falling C count is the single clearest measure of progress |
| **Assets without irreversible operations recorded** | Family D entries with empty `IRREVERSIBLE_OPERATIONS` | The acknowledgement gate is only as good as this list. Currently **zero** |

### 6.5 Baseline, today

| Metric | Value | Source |
|---|---|---|
| Registered assets | 54 (50 validation + 4 tooling) | `safety:register` |
| Family distribution | A 15 · B 8 · C 17 · D 10 | `safety:register` |
| Quarantined | 8 | register |
| Mutating assets without a fixture pattern | 6 | register |
| Assets with no verified runner | 4 | register |
| Register drift | 0 | `safety:verify-register` |
| Framework self-test | 124/124 | `safety:self-test` |
| Environment signals resolved | **0 of 3** | `safety:env` |

**[RECOMMENDED NEXT]** Re-measure this table monthly. It is six commands and it requires no
telemetry.

---

## 7. Framework change policy

**[IMPLEMENTED as of this phase]** The framework is closed to speculative additions.

A change to `scripts/safety/` is justified only by **a real operational event**: an incident, a
recurring troubleshooting question, a metric that cannot be derived, or a control that failed in
practice. "We might need it" is not a justification.

Every framework change carries: the operational event that prompted it, the metric or incident that
evidences it, and a self-test that would have caught the gap.

*Rationale:* the framework already exceeds its adoption. Adding features before it is used widely
optimises for imagined problems and increases the surface engineers must learn — which is itself a
barrier to the adoption the programme now needs.

---

## 8. Integration with the wider lifecycle

| Artefact | Relationship |
|---|---|
| **`REPOSITORY-GOVERNANCE.md`** *(not yet created)* | Will absorb this document as its Repository Safety section. Owns merge order, generated artefacts, Automated Refactoring Standards |
| **PAT Architecture** | Consumes RSP. See `PAT-RSP-INTEGRATION-ADDENDUM.md` |
| **Product Gap Register** | Records **product** defects. An unsafe asset is a **tooling** defect and belongs in the RSP register — putting it in the Gap Register would file it where nobody looks before running a script |
| **Merge checklist** | **[RECOMMENDED NEXT]** Add: register entry present, family declared, `verify-register` passing |
| **Release checklist** | **[FUTURE]** No release ships with an unsafe asset executable in the repository |
| **Engineering Standards** | RSP is where "know what your tools do before you run them" stops being advice and becomes a command that answers |
