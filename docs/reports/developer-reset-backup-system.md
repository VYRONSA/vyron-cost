# PCP-045A — Mandatory Backup Before Developer Reset

**Status: built, typechecked, linted and compiled. Not yet activated** — the SQL migration has not been applied and the supervisor password hash is not configured. Extends [PCP-045](./developer-reset-centre.md).

Date: 2026-08-03

---

## The guarantee

A reset cannot execute unless **either** a verified backup exists **or** the operator has ticked both acknowledgements. This is enforced in three independent places, so removing any one of them does not open the gate:

| Layer | Enforcement |
|---|---|
| UI | Execute button stays disabled until `backupLocation` is set or both checkboxes are ticked |
| API | [`execute/route.ts`](../../src/app/api/developer/reset-centre/execute/route.ts) returns `409` unless the backup verifies or both acknowledgements are present |
| Database | `vyron_dev_reset_execute` raises `refused: no backup was created and its absence was not acknowledged` **before the first delete** |

The database check is deliberately last-resort and placed in the top guard block, not near the audit insert. Even a direct RPC call bypassing the entire application cannot delete without satisfying it.

---

## Backup architecture

### The backup captures exactly what the reset deletes

Both come from the same generated scope predicates. `vyron_dev_reset_export_table` and `vyron_dev_reset_execute` are emitted by the same generator from the same plan, so a backup can never cover a different row set than the delete removes:

```sql
-- export
select to_jsonb(t) from public.vyron_cost_price_history t
  where t.supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);

-- delete
delete from public.vyron_cost_price_history
  where supplier_id IN (SELECT id FROM public.vyron_cost_suppliers WHERE company_id = p_company_id);
```

Identical apart from the outer alias. The alias qualifies only the outermost column — subqueries resolve against their own tables and never inherit it.

### Format

```
backups/
  Handcrafted-Food-Products/
    2026-08-03T19-42-11Z/
      manifest.json
      vyron_cost_suppliers.json
      vyron_cost_ingredients.json
      … one file per table in the module
```

- One JSON file per table, an array of whole rows as `to_jsonb`, so the file survives column additions.
- Tables are written in **reverse delete order** — parents before children — and `manifest.json` records that as `restoreOrder`, so a restore replays forwards without FK violations.
- `manifest.json` carries `companyId`, `module`, `createdAt`, per-table row counts and byte sizes, totals and duration.

The company slug is derived from the company name; the timestamp directory is a filesystem-safe ISO stamp (`:` → `-`).

### Where backups are written

`VYRON_BACKUP_ROOT`, or `<cwd>/backups` by default.

**This matters in production.** Serverless filesystems are read-only outside the temp directory, and any temp write is lost when the instance recycles. `isBackupLocationWritable()` probes the directory with a real write before every backup and before reporting status. If the location is not writable the UI shows the reason and **does not** report a backup as existing — the operator is pushed onto the acknowledgement path rather than being given false assurance.

For a hosted deployment, set `VYRON_BACKUP_ROOT` to a mounted persistent volume, or treat this tool as development/onboarding-only and rely on Supabase point-in-time recovery in production.

---

## Health check

Run immediately before execution, and again server-side inside the execute call. Seven checks, each reported with its own verdict so the operator sees exactly what blocks them:

| Check | Passes when |
|---|---|
| Company ID supplied | A company is selected |
| Reset module valid | The module key is one of the seven |
| Developer password verified | Password matches the configured scrypt hash |
| Target company found | The ID resolves in `vyron_cost_companies` |
| Transaction available | `vyron_dev_reset_preview` responds — proves the SQL functions are installed |
| Preview still current | Signed preview token matches company + module and is under 5 minutes old |
| Backup taken or absence acknowledged | Backup verifies, or both checkboxes ticked |

Displayed as **Ready to Reset** or **Cannot Continue** with the failing reason, e.g. *"Preview expired. Please refresh."*

### Preview freshness

A preview issues an HMAC-signed token binding `companyId`, `module`, the row total and the issue time. Execution verifies the signature with `timingSafeEqual`, checks the company and module match, and rejects anything older than five minutes with `409`. This prevents the specific failure where an operator previews, walks away, data changes, and then deletes against numbers they were shown minutes earlier.

---

## Post-reset validation

Runs automatically, and re-reads the database rather than trusting the delete's own return value. `validateCleanState()` re-runs the module preview and reports:

```
Finished Goods .......... 0
Products ................ 0
BOMs .................... 0
BOM Lines ............... 0
Ingredients ............. 0
Suppliers ............... 0
Supplier Invoices ....... 0
Invoice Lines ........... 0
Stock Items ............. 0
Production Runs ......... 0
Purchase Orders ......... 0
Goods Receipts .......... 0
Orphan Records .......... 0
```

Then either **✔ Environment is clean. Ready for import.** or **❌ Reset incomplete.** with every table that still holds rows.

"Orphan Records" is the total rows still in module scope after the delete. Because the delete set is closed under incoming foreign-key references (see PCP-045), a non-zero value means a table was added to the schema without regenerating the plan — the actionable fix is `npm run reset:sql`.

---

## Restore process

Backups are restorable with a real tool, not just documentation:

```bash
# dry run — reports what would be written, writes nothing
npm run reset:restore -- backups/Handcrafted-Food-Products/2026-08-03T19-42-11Z

# actually restore
npm run reset:restore -- backups/Handcrafted-Food-Products/2026-08-03T19-42-11Z --execute
```

[`restore-developer-backup.mjs`](../../scripts/restore-developer-backup.mjs):

- **Dry run by default.** Writing requires `--execute`.
- **Refuses if the company no longer exists**, rather than resurrecting rows into a void.
- **Replays `manifest.restoreOrder`** — parents before children, so foreign keys hold at every step.
- **Upserts on primary key in 500-row chunks**, so a partial failure is repaired by re-running rather than duplicated.

### Recovery procedure

1. Identify the backup: `backups/<Company-Slug>/<timestamp>/manifest.json` records the company, module and row counts.
2. Dry-run the restore and confirm the table list and counts match the manifest.
3. Re-run with `--execute`.
4. Confirm in the application: Suppliers, Products, BOMs and Raw Materials pages should show their pre-reset counts.

If the reset itself failed part-way, no restore is needed — the delete runs inside one Postgres transaction and rolls back in full.

---

## Audit trail

`vyron_dev_reset_audit` gains three columns (added with `add column if not exists`, so existing installs upgrade cleanly):

| Column | Meaning |
|---|---|
| `backup_created` | A verified backup existed at execution |
| `backup_location` | The verified path |
| `backup_acknowledged_without` | Operator explicitly proceeded with no backup |

Written inside the same transaction as the deletes, so an audit row exists if and only if the delete committed. Together with the existing columns the record covers user, company, module, backup status and location, rows deleted per table, duration and timestamp.

`vyron_platform_auth_audit` additionally receives `developer.reset.backup`, `developer.reset.backup.failed`, `developer.reset.executed`, `developer.reset.denied` and `developer.reset.failed` with actor, role, IP and user agent.

The supervisor password is recorded in neither, and is not logged on rejection.

---

## Safety guarantees

| Rule | Enforcement |
|---|---|
| Never execute without Company ID | Health check + SQL `raise` on null |
| Never execute against another tenant | Every predicate resolves to `p_company_id`; company re-resolved server-side, never trusted from the browser |
| Never delete users / auth / settings / shared reference / financial accounts | Protected-name guard in the plan generator; `vyron_financial_accounts` is referenced by products but never in any delete set |
| Never delete backup files | No code path deletes from the backup root; the reset touches the database only |
| Never bypass the transaction | Deletes exist only inside the `plpgsql` function body |
| Backup cannot be forged | `backupLocation` is matched against a strict pattern and the resolved path is re-checked to be inside the backup root, so `backups/../../etc` is rejected before any filesystem access |
| Backup cannot be borrowed | `verifyBackup` rejects a manifest whose `companyId` differs from the target |

---

## Workflow

1. Select company
2. Preview deletions — issues a signed, time-limited token
3. Create backup (preferred) or tick both acknowledgements
4. Run health check — seven verdicts
5. Type `DELETE`, confirm in the dialog
6. Execute — one transaction
7. Automatic validation → "Environment is clean. Ready for import."

---

## Validation performed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint` on all new and changed files | clean |
| `npx next build` | compiled successfully in 101s; 329 pages |
| Routes registered | `/api/developer/reset-centre/{companies,preview,backup,health,execute}` |
| Path traversal guard | verified against 6 inputs — legitimate paths accepted, `backups/../../etc/passwd`, `backups/x/../../../etc`, `../../etc` and a trailing-`..` variant all rejected |
| Export vs delete predicate parity | confirmed identical apart from the outer alias, on nested two-hop cases |
| Migration applied | **no** |
| End-to-end backup + reset executed | **no** — blocked on the migration and password hash |

### Known build warning

Turbopack warns that `path.join(backupRoot(), …)` is not statically analysable, because the backup root is configurable at runtime. This is inherent to a configurable path and does not affect runtime `fs` behaviour in the Node runtime these routes use. The build succeeds.

---

## Activation

Unchanged from PCP-045, with one addition:

1. Apply [`supabase/pcp-045-developer-reset-centre.sql`](../../supabase/pcp-045-developer-reset-centre.sql) — now also creates `vyron_dev_reset_export_table`, adds the three audit columns and the pre-delete backup guard. Safe to re-run over the PCP-045 version.
2. `npm run reset:password-hash` → set `VYRON_DEV_RESET_PASSWORD_HASH`.
3. **Set `VYRON_BACKUP_ROOT`** to a writable, persistent location if the default `<cwd>/backups` is not durable on your host.
4. Rehearse on a disposable `FG Test …` tenant: preview → backup → restore dry-run → reset → confirm the clean state. Verify the restore *before* trusting the backup on anything real.
