# PAT Architecture — Repository Safety Integration Addendum

**Status:** Addendum to `docs/PAT-ARCHITECTURE.md`. **That document is not modified by this one.**
**Purpose:** state how PAT consumes the Repository Safety Programme, and which PAT sections are
superseded by it so that neither document duplicates the other.

| Label | Meaning |
|---|---|
| **[IMPLEMENTED]** | Exists today, verified |
| **[RECOMMENDED NEXT]** | Adopt now; needs no new framework |
| **[FUTURE]** | Requires a later PAT phase |

---

## 1. What changed since the PAT Architecture was written

`PAT-ARCHITECTURE.md` was written before the Test Infrastructure Audit and before RSP existed. Three
of its assumptions are now answered by working code rather than by design intent:

| PAT section | Then | Now |
|---|---|---|
| §2.3 Environment guard | **TO BUILD** — `scripts/pat/guard.mjs`, `VYRON_ENV` plus a host allowlist | **[IMPLEMENTED]** as `scripts/safety/environment.mjs`, with **three** signals rather than two, and a mandatory database-identity rule for mutating assets |
| §2.7 Secrets management | **PARTIAL** — scripts parse `.env.local` by hand | Unchanged in the assets, but the safety layer reads only non-secret discriminators and records credentials as **presence only** |
| §8 P1 "migrate the ~25 scripts onto the guard" | A self-contained first step | **Superseded.** Assets are wrapped from the outside; none was modified, and none imports the framework |

**The most important correction.** PAT §2.2 argues that isolation by credentials holds even when the
code under test is wrong. That is sound for every asset except the six Xero assets, which **select
their target by querying the database for a live Xero connection**. Pointing them at a PAT database
does not make them safe — it makes them search the PAT database. PAT must therefore treat Family D
as a category requiring an allowlisted external target, not merely an isolated database.

---

## 2. Division of ownership

**PAT owns the product question. RSP owns the tooling question.** Neither should restate the other.

| Concern | Owner | Note |
|---|---|---|
| Environment **topology** and provisioning | **PAT** §2.1–2.2 | RSP consumes it as policy input |
| Environment **detection and enforcement** | **RSP** | **Supersedes PAT §2.3.** PAT should reference, not restate |
| Credential policy | **RSP** | PAT §2.7 describes `.env.pat`; RSP owns the governance around it |
| Execution families and per-execution approval | **RSP** | No PAT equivalent existed |
| Cleanup and teardown standard | **RSP** | PAT owns **reset**, which is a different mechanism |
| Test data seed and determinism | **PAT** §3 | RSP requires determinism without specifying the corpus |
| Test catalogue and assertions | **PAT** §5 | RSP is indifferent to what an asset asserts |
| Release gating | **PAT** §6 | RSP gates are per-execution, not per-release |
| Asset classification | **RSP** | PAT catalogues tests, not their safety properties |

**[RECOMMENDED NEXT]** When `PAT-ARCHITECTURE.md` is next revised, replace §2.3 with a pointer to
this addendum. Do not delete the section — its *rationale* for fail-closed behaviour remains correct
and is worth keeping.

---

## 3. How PAT will use the safety wrapper

**Every PAT execution runs through `scripts/safety/run.mjs`.** The PAT runner does not construct
Supabase clients, evaluate environments or print its own banners — it invokes assets through the
wrapper and reads the resulting reports.

```
PAT runner
   └── for each catalogue entry
         └── safety:run <asset> --verify-cleanup --strict-cleanup
                                --approver <pat-runner> --report evidence/<run-id>/<asset>.json
```

This gives PAT four properties it would otherwise have to build:

1. **Environment proof per test**, not per run. A suite that drifts mid-run is detected.
2. **Exit codes preserved verbatim**, so PAT's pass/fail logic is unchanged by wrapping.
3. **`--strict-cleanup`**, which makes a residue leak fail the test rather than merely warn. This is
   the flag's intended home: the runbook default preserves the asset's own exit code because an
   engineer's workflow should not change, but **a gate must fail on residue.**
4. **An evidence bundle for free** — one report per asset, satisfying PAT §6 Gate 5's requirement for
   retained evidence with run id, pass/fail and durations.

**[FUTURE]** The runner itself. RSP provides the per-execution layer; PAT provides the orchestration
above it.

---

## 4. How PAT will consume safety reports

The safety report (`schemaVersion: 1`) is **the unit of PAT evidence.** PAT should not invent a
second result format.

| PAT need (§6 Gate 5) | Report field |
|---|---|
| Pass/fail per test | `status`, `exitCode` |
| Duration | `durationMs`, `startedAt`, `finishedAt` |
| Which environment | `environment`, `environmentVerified`, `effectiveEnvironment` |
| Evidence of clean state | `cleanup`, `cleanupDetail` |
| Approval trail | `acknowledgement.approver`, `.token` |

Three report semantics matter especially to a gate:

- **`status: PASS` already requires `exitCode: 0` AND cleanup not failed.** A green test that leaked
  is not a pass. PAT should not re-implement this rule — it is already enforced.
- **`environmentVerified: false` invalidates the run as gate evidence.** A PAT gate must reject a
  bundle whose environment was never proven, however green the tests. **[RECOMMENDED NEXT]** make
  this an explicit precondition of Gate 5.
- **`cleanup: NO_PATTERN` is not a pass and not a failure — it is an unverifiable.** PAT should count
  these separately and treat a rising count as coverage debt.

**[FUTURE]** The PAT dashboard reads these reports directly. No new instrumentation is required —
this is why the report was defined with a schema version.

---

## 5. How PAT will use cleanup verification

PAT §3.3 requires **reset before each gated run**, not cleanup after. That remains correct and RSP
does not replace it. The two are complementary and answer different questions:

| Mechanism | Owner | Question |
|---|---|---|
| **Reset** | PAT | Is the environment in a known state *before* this run? |
| **Fixture residue** | RSP | Did this asset clean up after *itself*? |
| **Artefact ledger** | RSP | Exactly which artefacts did this asset create? |

**Why PAT still needs the residue check despite reset.** Reset guarantees a clean start; it says
nothing about whether an individual asset leaks. An asset that leaks is invisible under reset-only
— every run looks clean because the environment was wiped — right up until it runs somewhere that
is not reset. The residue check is what surfaces the defect, and it is how a Family C asset earns
promotion to Family B.

**Honest limitation, restated so PAT does not over-rely on it.** A `VERIFIED` residue result shows
no *tenant* survived. It does not detect orphaned child rows whose parent company was deleted — the
defect in `test-manufacturing-lifecycle-enterprise`. **Reset is what protects PAT from those; the
residue check is what identifies which asset produced them.** Neither substitutes for the other.

**[FUTURE]** Artefact-level tracking (`cleanup-verify.mjs`) requires assets to adopt the tracker.
When PAT consolidates assets into the catalogue (PAT §8 P4) it should adopt it at the same time —
that is the natural moment, because the assets are being edited anyway.

---

## 6. How PAT will respect execution families

The family determines an asset's place in the PAT catalogue and its gating behaviour.

| Family | PAT treatment |
|---|---|
| **A — Read-only** | Preconditions and probes. `validate-schema-drift` becomes the **Gate 3 precondition** PAT §2.5 already proposes: drift check first, abort on failure |
| **B — Ephemeral** | The gated suite. These are the only assets that should gate a release |
| **C — Persistent** | **Must not gate a release.** A test that leaks makes each run non-reproducible, which is the property a gate depends on. Admissible to PAT only once promoted to B |
| **D — External** | **Never in the gated suite.** Non-deterministic, metered, and irreversible. Scheduled runs against an allowlisted demo target, reported as a **tracked metric, not a pass/fail gate** — the same treatment PAT §2.8 already gives live-mode AI accuracy, for the same reason |

**Consequence for PAT §8 P4.** Consolidation should proceed **family by family, not module by
module**: the 8 Family B assets first (they are gate-ready), then the Family C backlog as each is
promoted. Consolidating by module would mix leaking assets into the gated suite and make the gate
unreliable from its first day.

### The Family C promotion path

An asset moves from C to B when it satisfies the Cleanup Standard and demonstrates it:

1. Complete the teardown (Hardening Plan Part 7).
2. Declare a fixture pattern.
3. Run wrapped with `--verify-cleanup` until residue detections reach zero.
4. Reclassify in `manifest.mjs`, with the evidence.

**[RECOMMENDED NEXT]** This is the highest-value PAT preparation work available today, and it needs
no PAT environment: **17 Family C assets, of which 8 need teardown written and 9 need teardown
completed.** Every one promoted is a test the gated suite can eventually use.

---

## 7. Sequencing

RSP does not change PAT's phases; it changes what each depends on.

| PAT phase | RSP dependency | State |
|---|---|---|
| **P1** — PAT project, `.env.pat`, `VYRON_ENV`, guard, migrate scripts | Guard **[IMPLEMENTED]**. Migration superseded — assets are wrapped, not modified | Reduced to provisioning plus one allowlist entry |
| **P2** — Seed and reset; drift check as precondition | None. RSP's residue check complements reset | Unblocked |
| **P3** — Validation assets | None | Unblocked |
| **P4** — Runner; consolidate; PAT-AUTH/AUTHZ | Consumes the family classification and the report schema. **Blocked on the Family C backlog** for anything gating | Partially blocked |
| **P5** — PAT-IMPORT, PAT-EXTRACT | Family D policy governs extraction runs | Unblocked |
| **P6** — Baseline diffing | None | Unblocked |
| **P7–P8** — Live accuracy, gate enforcement | Family D scheduling; report consumption | Unblocked |

**The one item that gates everything: resolving which Supabase project is production** (Hardening
Plan Unknown 13.1). Until then no environment can be verified, every mutating asset is correctly
prohibited, and PAT cannot provision an environment it can prove is distinct from production.

---

## 8. What this addendum does not claim

- **No PAT capability is implemented by RSP.** No PAT environment exists, no seed, no reset, no
  runner, no catalogue. RSP provides the per-execution safety layer those will sit on.
- **The wrapper is not a test runner.** It runs one asset and reports on it.
- **Family classification is not test coverage.** An asset can be Family B, perfectly clean, and
  assert nothing useful.
- **RSP does not make PAT unnecessary.** It makes the tooling safe to build PAT with.
