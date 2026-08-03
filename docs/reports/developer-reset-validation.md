# PCP-045D — Developer Reset Centre Validation

**Result: PASS.** All eight stages completed successfully on the FG Test tenant.

Date: 2026-08-03
Tenant: `dcf39669-5d0f-436e-8f70-f9a09dd63fae` — FG Test 1783068778494
Module: `factory` (56 tables)
Command: `node scripts/test-developer-reset-e2e.mjs --company dcf39669-5d0f-436e-8f70-f9a09dd63fae --execute`

Handcrafted Food Products was not touched at any point.

---

## Test sequence

| # | Stage | Result |
|---|---|---|
| 0 | Preflight — both RPCs respond | PASS |
| 1 | Baseline — 5 tables, 7 rows in scope | PASS |
| 2 | Backup guard refuses reset with no backup and no acknowledgement | PASS |
| 3 | Backup — 56 files, 7 rows | PASS |
| 4 | Restore dry run — reports rows, writes nothing | PASS |
| 5 | Reset — deleted exactly the previewed count | PASS |
| 6 | Verify empty — 0 rows remain, audit row written | PASS |
| 7 | Restore | PASS |
| 8 | Verify restored — matches baseline exactly | PASS |

Baseline in scope:

```
vyron_cost_products      2
vyron_cost_bom_lines     2
vyron_cost_boms          1
vyron_cost_stock_items   1
vyron_cost_stock_ledger  1
                         ─
                         7
```

---

## Execution times

| Stage | Duration |
|---|---|
| Backup (56 table exports) | 12,366 ms |
| Reset (in-transaction delete) | **11 ms** |
| Restore | ~9 s |
| Full workflow | ~35 s |

The reset itself is the fast part; the backup dominates because it issues one RPC per table across all 56 tables regardless of whether they hold rows.

First run, for comparison: backup 12,628 ms, reset 22 ms.

---

## Backup verification

```
backups/FG-Test-1783068778494/2026-08-03T18-55-52Z/
```

| Property | Value |
|---|---|
| Files | 57 (56 table exports + `manifest.json`) |
| Rows captured | 7 |
| Size | 5,437 bytes |
| Row count vs preview | **matches exactly** (7 = 7) |

The harness asserts backup row count against the preview total, so a backup that silently captured a different row set than the reset would delete fails the run.

## Reset verification

- Deleted 7 rows — exactly the previewed count
- 0 rows remained in module scope afterwards
- 0 orphan records
- 0 foreign key violations
- Circular FK `products.linked_bom_id ↔ boms.product_id` handled by the pre-delete `UPDATE`

## Restore verification

Row counts after restore, per table, against baseline:

| Table | Baseline | Restored |
|---|---|---|
| `vyron_cost_products` | 2 | 2 |
| `vyron_cost_bom_lines` | 2 | 2 |
| `vyron_cost_boms` | 1 | 1 |
| `vyron_cost_stock_items` | 1 | 1 |
| `vyron_cost_stock_ledger` | 1 | 1 |

Data integrity spot-check beyond counts:

```
PRODUCTS
  FG Product 1783068778494          bom=0abc64d4-a2e0-4cac-bede-fdf9ffb16c82  sell=240  cost=140
  FG Delete Candidate 1783068778494 bom=null                                  sell=99   cost=50

BOM LINES
  Flour  qty=1.2  unit=22   line_cost=26.664
  Bag    qty=10   unit=1.5  line_cost=15
```

`linked_bom_id` was re-established on the one product that had it, and the generated column `line_cost` was recomputed correctly by the database.

## Health verification

The guard was proven by attempting a reset with `backup_created=false` and `backup_acknowledged_without=false`:

```
PASS  reset refused as designed
PASS  no rows lost to the refused attempt
```

Postgres raised `refused: no backup was created and its absence was not acknowledged` **before the first delete**, and the row count was unchanged after the refused attempt.

## Audit written

Both runs recorded, with backup location:

| Timestamp | Module | Rows | Duration | Backup | Location | Ack | Status |
|---|---|---|---|---|---|---|---|
| 2026-08-03T18:56:05Z | factory | 7 | 11 ms | true | `backups/FG-Test-1783068778494/2026-08-03T18-55-52Z` | false | success |
| 2026-08-03T18:54:48Z | factory | 7 | 22 ms | true | `backups/FG-Test-1783068778494/2026-08-03T18-54-35Z` | false | success |

---

## Defects encountered

Both surfaced in **Stage 7 (Restore)** on the first run. Nothing else was modified.

### Defect 1 — restore violated the circular foreign key

```
vyron_cost_products  FAILED at row 0:
  insert or update on table "vyron_cost_products"
  violates foreign key constraint "vyron_cost_products_linked_bom_id_fkey"
```

**Root cause.** Restore order is the reverse of delete order. The delete removes BOMs then products, so the reverse inserts products then BOMs — but products reference BOMs via `linked_bom_id`. The delete path breaks this cycle with an `UPDATE ... SET linked_bom_id = NULL`; the restore path had no equivalent.

**Fix.** [`scripts/restore-developer-backup.mjs`](../../scripts/restore-developer-backup.mjs) now defers that column: products are inserted with `linked_bom_id` nulled, the original values are held, and a relink pass re-applies them once every table is restored. Confirmed by `(relinked deferred FKs) 1` in the output and by the product carrying its BOM id afterwards.

### Defect 2 — restore tried to write a generated column

```
vyron_cost_bom_lines  FAILED at row 0:
  cannot insert a non-DEFAULT value into column "line_cost"
```

**Root cause.** `vyron_cost_bom_lines.line_cost` is `GENERATED ALWAYS`. The backup captures whole rows via `to_jsonb`, which includes generated columns, and Postgres rejects any supplied value for them.

**Fix.** The restore reads the column name out of the Postgres error, strips it from the payload and retries, rather than hard-coding a schema-specific exclusion list that would drift as the schema changes. `line_cost` was recomputed correctly by the database on restore (`26.664`, `15`).

### Recovery from the failed run

The failed restore left the tenant with 3 of 7 rows. Because the upsert is idempotent on the primary key, re-running the fixed restore against the same backup directory repaired it to the full 7 rows with no duplicates — which also validated the documented recovery procedure under real conditions rather than hypothetically.

## Fixes applied

One file changed: `scripts/restore-developer-backup.mjs`.

No changes to the migration, the reset functions, the API routes, the UI, or the backup path. No redesign, refactoring or optimisation.

---

## Final certification

The Developer Reset Centre is **validated** for the `factory` module against a disposable tenant.

Proven end to end:

- Backup captures exactly the row set the reset deletes
- The database-level guard blocks a reset with no backup, before any row is touched
- The reset is transactional, respects foreign key order, and handles the products↔BOMs cycle
- Post-reset state is verifiably empty with zero orphans
- Restore reconstructs the exact baseline, including circular references and generated columns
- Audit rows are written with the backup location

### Scope limits of this certification

State these plainly rather than over-claiming:

1. **Volume.** The test tenant held 7 rows across 5 tables. Handcrafted Food Products holds roughly 837 rows across suppliers, ingredients, stock, products and BOMs. Behaviour under a two-orders-of-magnitude larger set — particularly restore chunking and PostgREST payload limits — has not been exercised.
2. **Module coverage.** Only `factory` was run. The six individual modules share the same generated predicates but were not individually executed.
3. **Table coverage.** 51 of the 56 tables held zero rows, so their delete and restore paths ran but moved nothing. Tables such as documents, invoices and purchase orders are untested with real data.
4. **HTTP layer.** Validation ran against the RPCs directly. The API routes, the health-check endpoint and the UI call these same functions, but the browser path was not exercised in this run.

### Recommendation for Handcrafted Food Products

The tool is sound enough to use, with these conditions:

1. Run a **preview only** first and confirm the table list and counts match expectations.
2. Take the **backup** and immediately run a **restore dry run** against it — before the reset — to confirm every file is readable at that data volume.
3. Prefer a **single module** over `factory` if the intent is narrower. Note that "Reset Suppliers" pulls in 31 tables by FK closure.
4. Keep an independent Supabase point-in-time recovery window available. The file backup is now proven, but it is not a substitute for a database-level restore point on a client tenant.

Do not execute against Handcrafted Food Products without explicit instruction.
