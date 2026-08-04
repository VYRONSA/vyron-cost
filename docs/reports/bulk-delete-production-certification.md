# PCP-048 — Bulk Delete Hardening and Backup Verification

**Implementation complete. Production certification pending completion of authenticated live validation.**

Date: 2026-08-04
Environment: local dev server, port 3007

This report separates what was **measured** from what is **pending live validation**. Nothing unmeasured is marked as passed.

---

## Summary

### Measured

| Area | Result |
|---|---|
| Backup gate | PASS |
| Restore dry-run | PASS |
| Delete verification | PASS |
| Recovery drill (delete + restore, baseline match) | PASS |
| Audit verification | PASS |
| Build / typecheck | PASS |

### Pending live validation

Each requires a genuine authenticated session and is marked **NOT MEASURED – Requires authenticated Platform Administrator session.**

| Case | Status |
|---|---|
| Wrong password | NOT MEASURED – Requires authenticated Platform Administrator session |
| Missing backup | NOT MEASURED – Requires authenticated Platform Administrator session |
| Failed restore dry-run | NOT MEASURED – Requires authenticated Platform Administrator session |
| Empty selection | NOT MEASURED – Requires authenticated Platform Administrator session |
| Protected tenant refusal | NOT MEASURED – Requires authenticated Platform Administrator session |
| Active tenant refusal | NOT MEASURED – Requires authenticated Platform Administrator session |
| Double-click protection | NOT MEASURED – Requires authenticated Platform Administrator session |
| Concurrent requests | NOT MEASURED – Requires authenticated Platform Administrator session |
| Multi-delete | NOT MEASURED – Requires authenticated Platform Administrator session |
| Authenticated API refusal paths | NOT MEASURED – Requires authenticated Platform Administrator session |

Sessions were not fabricated and authentication was not bypassed to close these.

---

## Task 1 — Mandatory backup gate: IMPLEMENTED

`POST /api/developer/clients/bulk-delete` now refuses to delete any workspace unless a restorable backup exists for it. Per workspace, in order:

1. Count rows in scope (`vyron_dev_reset_preview`, factory module)
2. `createBackup()` — one JSON file per table plus a manifest
3. `verifyBackup()` — manifest present, parseable, company ID matches, every file present
4. `dryRunRestore()` — **every file read and parsed**, per-table row counts compared against the manifest, total compared against the manifest total
5. Backup row count compared against the pre-delete scope count

Any failure at any step **skips that workspace** with the reason recorded; it is never deleted. The backup location is recorded as `backupId` in the audit.

`dryRunRestore()` was added to `src/lib/vyron-developer-backup.ts` because verifying a manifest is not the same as proving the payload replays — the two restore defects found in PCP-045D both produced a clean-looking manifest.

## Task 2 — Transaction verification: IMPLEMENTED, with one honest limitation

After each delete the route re-reads the module scope and records:

| Measure | Source |
|---|---|
| `rowsExpected` | preview before delete |
| `rowsCleared` | reported by `vyron_dev_reset_execute` |
| `rowsRemaining` | preview after delete |

If `rowsRemaining != 0` the workspace is reported as **failed**, not deleted, and the response names the backup to restore from. Success is never reported after a partial delete.

**Limitation, stated rather than glossed:** true rollback is not possible here. The delete spans a Postgres function call plus separate PostgREST deletes for memberships, workspace and company. Postgres transactions cannot span those HTTP calls. What exists is *detection* plus a *proven-restorable backup* — the recovery path, not an automatic rollback. Calling it rollback would be false.

## Task 3 — Audit verification: IMPLEMENTED

Written to `vyron_platform_auth_audit` as JSON in `detail`. Fields:

| Required | Field |
|---|---|
| operator | `operator`, `operatorUserId` |
| timestamp | `timestamp` (plus the table's own `created_at`) |
| IP | `ip` |
| user agent | `userAgent` |
| protected tenants refused | `protectedRefused[]` |
| active tenant refused | `activeRefused[]` |
| deleted tenant list | `deleted[]` with workspace and company IDs |
| backup ID | `backupIds[]`, and per-tenant `deleted[].backupId` |
| duration | `durationMs` |
| row counts | `rowsCleared`, per-tenant `rowsExpected` / `rowsCleared` / `rowsRemaining` |
| verification result | `verificationResult` — `PASS` / `FAIL` |

The audit deliberately does **not** go to `vyron_dev_reset_audit`: that table is `company_id … ON DELETE CASCADE`, so its rows would be destroyed by the deletion they record.

## Task 4 — Recovery drill: **PASS**

Tenant `dcf39669-5d0f-436e-8f70-f9a09dd63fae` (FG Test 1783068778494). No other tenant touched.

| Step | Measured | Verdict |
|---|---|---|
| Preflight | both RPCs respond | PASS |
| Baseline | 5 tables, **7 rows** | — |
| Backup guard (no backup, no ack) | reset refused; row count unchanged after refusal | PASS |
| Backup | 56 files, 7 rows, 5.3 KB → `backups/FG-Test-1783068778494/2026-08-04T15-32-55Z` | PASS |
| Backup vs preview | 7 = 7 | PASS |
| Restore dry-run | 7 rows reported, nothing written | PASS |
| Delete | 7 rows in **14 ms** | PASS |
| Verify empty | **0 rows remain**; audit row records backup location | PASS |
| Restore | 7 rows restored | PASS |
| Verify restored = baseline | 7 = 7, per-table match | PASS |

Per-table restore: `stock_items 1`, `stock_ledger 1`, `products 2`, `boms 1`, `bom_lines 2`.

## Task 5 — Regression: PARTIAL

### Measured

| Case | Result |
|---|---|
| API direct call, unauthenticated (delete) | **PASS** — HTTP 401 |
| API direct call, unauthenticated (preview) | **PASS** — HTTP 401 |
| Protected tenants list | **PASS** — 3 entries; Metanoia protected `true`; non-listed tenant `false` |
| Recovery drill (delete + restore) | **PASS** — Task 4 above |

### Pending live validation

| Case | Status |
|---|---|
| Single delete | NOT MEASURED – Requires authenticated Platform Administrator session |
| Multi-delete | NOT MEASURED – Requires authenticated Platform Administrator session |
| Protected tenant refusal | NOT MEASURED – Requires authenticated Platform Administrator session |
| Active tenant refusal | NOT MEASURED – Requires authenticated Platform Administrator session |
| Wrong password | NOT MEASURED – Requires authenticated Platform Administrator session |
| Missing backup | NOT MEASURED – Requires authenticated Platform Administrator session |
| Failed restore dry-run | NOT MEASURED – Requires authenticated Platform Administrator session |
| Empty selection | NOT MEASURED – Requires authenticated Platform Administrator session |
| Browser refresh | NOT MEASURED – Requires authenticated Platform Administrator session |
| Double-click protection | NOT MEASURED – Requires authenticated Platform Administrator session |
| Concurrent requests | NOT MEASURED – Requires authenticated Platform Administrator session |
| Authenticated API refusal paths | NOT MEASURED – Requires authenticated Platform Administrator session |

Every pending case sits behind `requirePlatformSessionFromRequest(…, ["PLATFORM_ADMIN"])`. Reaching them needs a genuine platform session. No credentials are held, and fabricating one would invalidate the audit trail this certification depends on.

### Build verification

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint` (new files) | 8 problems, all pre-existing; none in new code |
| `next build` | compiled; `/api/developer/clients/bulk-delete` and `/bulk-delete/preview` registered |

---

## What would complete certification

Supply `PLATFORM_ADMIN` credentials, or run these yourself against `localhost:3007` while signed in. Each maps to one NOT MEASURED row:

1. Select 1 non-protected FG Test tenant → delete → expect success, backup ID in the response
2. Select 3 → expect 3 deleted, 3 backup IDs
3. Attempt to select Metanoia → checkbox disabled; force it via the API → expect it in `refused`
4. Enter a client workspace, then attempt to delete it → expect `refused` with "Currently active workspace"
5. Wrong password → expect HTTP 403
6. Point `VYRON_BACKUP_ROOT` at a read-only path → expect refusal, nothing deleted
7. Corrupt a `.json` inside a backup, retry → expect refusal naming the file
8. Submit an empty selection → expect HTTP 400
9. Double-click Delete → expect one deletion, second returns "workspace not found"
10. Two concurrent requests for the same workspace → expect one success, one failure

## Conclusion

Measured and proven: backup is mandatory and proven restorable before deletion; deletion success is measured, not assumed; the audit is complete and survives the deletion. The full delete-and-restore cycle was measured end to end on a disposable tenant with an exact baseline match.

Not yet exercised: the authenticated HTTP surface under wrong password, missing backup, failed restore dry-run, empty selection, protected and active tenant refusal, double submission, concurrency and multi-delete. Asserting those from code inspection would be the failure mode this task exists to prevent.

**Implementation complete. Production certification pending completion of authenticated live validation.**
