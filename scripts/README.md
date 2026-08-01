# `scripts/` — executable validation assets

**Prefer running assets through the safety wrapper:**

```bash
npm run safety:run -- <asset>              # banner, preflight, invoke, verify, report
npm run safety:run -- <asset> --dry-run    # every safety step, without invoking
npm run safety:preflight -- <asset>        # inspect only
```

The wrapper composes around the asset — it does not modify it, and it returns
the asset's original exit code. Invoked directly, every asset behaves exactly as
it always has.

This directory holds **50 executable validation assets** plus 4 non-validation
tooling scripts. Only three are registered as npm scripts; the rest are invoked
by hand. They are not tests in the usual sense — there is no runner, no CI, and
several of them **write to a database and to systems outside this repository.**

---

## The three things worth knowing before you run one

**1. The `tmp-` prefix means nothing.** All 24 `tmp-*` files are git-tracked and
permanent. Six of them write to a live customer's Xero accounting system. The
prefix reads as "disposable" and is the reason that family went uncharacterised
through several prior investigations.

**2. No asset can tell which database it is connected to.** All 47
database-touching assets hand-parse `.env.local` and authenticate with the
service-role key, which bypasses Row-Level Security. None validates the resolved
host. There is no value an asset could read that would tell it to stop.

**3. Cleanup is inconsistent.** 8 assets tear down completely; 9 tear down
partially, orphaning rows they created; 7 have no teardown at all. `finally` does
not run on `Ctrl-C` or on `process.exit()` inside a `try` — and several assets
call exactly that.

---

## Families

| Family | Risk | Count | Meaning |
|---|---|---|---|
| **A** | SAFE | 15 | Read-only. Queries and inspection. |
| **B** | LOW | 8 | Ephemeral. Creates its own tenant and removes it. |
| **C** | HIGH | 17 | Persistent. Leaves data behind. |
| **D** | CRITICAL | 10 | External. Mutates what this repository cannot reverse. |

```bash
npm run safety:register        # every asset, with family, mutation and cleanup
npm run safety:env             # which environment am I actually in?
```

**The register in [`safety/manifest.mjs`](safety/manifest.mjs) is the source of
truth** — it carries the classification and the audit evidence for each asset.
Do not maintain a second list here; it would drift.

---

## Adding a new asset

1. **Check one does not already exist** — `npm run safety:register`.
2. Classify it in [`safety/manifest.mjs`](safety/manifest.mjs) — family, mutation
   level, authentication, external integrations, cleanup expectation, evidence.
3. If it creates tenants, declare its fixture pattern in `FIXTURE_PATTERNS`;
   without one its cleanup can never be verified.
4. If it is Family D, record its irreversible operations in
   `IRREVERSIBLE_OPERATIONS` — the acknowledgement gate has nothing to show
   without them.
5. Confirm it is registered: `npm run safety:verify-register` (exits non-zero if
   anything on disk is unclassified).
6. Run it through the wrapper, not directly.

Full guidance: [`safety/README.md`](safety/README.md).

---

## Documentation

| Document | What it covers |
|---|---|
| [`../docs/REPOSITORY-SAFETY-RUNBOOK.md`](../docs/REPOSITORY-SAFETY-RUNBOOK.md) | **Start here.** The engineer's operational guide: workflows, families, troubleshooting |
| [`safety/README.md`](safety/README.md) | Reference for the safety tooling: banners, environment verification, metadata, cleanup verification |
| [`../docs/REPOSITORY-SAFETY-GOVERNANCE.md`](../docs/REPOSITORY-SAFETY-GOVERNANCE.md) | Adoption plan, ownership, approvals, when a safety review is mandatory, metrics |
| [`../docs/TEST-INFRASTRUCTURE-AUDIT.md`](../docs/TEST-INFRASTRUCTURE-AUDIT.md) | What every asset actually does, with evidence |
| [`../docs/REPOSITORY-SAFETY-HARDENING-PLAN.md`](../docs/REPOSITORY-SAFETY-HARDENING-PLAN.md) | The classification rules, environment policy and roadmap |

---

## Current status

**Adoption is opt-in.** No validation asset has been modified. Invoked directly,
every asset behaves exactly as before; the safety layer composes around them
through `safety:run`, which you choose to use.

Family D assets require an explicit typed acknowledgement naming their
irreversible operations. Quarantine is metadata — the wrapper refuses the 8
quarantined assets, but the files remain executable directly. Credential
removal, Xero rebuilds, teardown completion and file-level quarantine are later
phases of the Repository Safety Programme.
