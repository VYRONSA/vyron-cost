# PCP-045 — Developer Supervisor Reset Centre

**Status: built, typechecked, linted and compiled. Not yet activated — the SQL migration has not been applied and the supervisor password hash is not configured.** See [Activation](#activation).

Date: 2026-08-03
Route: `/developer/reset-centre` (direct URL only)

---

## Architecture

Four layers, each of which can refuse the operation independently.

| Layer | File | Responsibility |
|---|---|---|
| UI | [`DeveloperResetCentreClient.tsx`](../../src/components/vyron-cost/developer/DeveloperResetCentreClient.tsx) | Collects target, password, confirmation. Renders counts returned by the server. Holds **no** delete logic and **no** table list of its own. |
| Page | [`developer/reset-centre/page.tsx`](../../src/app/developer/reset-centre/page.tsx) | `noindex, nofollow, nocache`. Not linked from any navigation surface. |
| API | [`preview`](../../src/app/api/developer/reset-centre/preview/route.ts), [`execute`](../../src/app/api/developer/reset-centre/execute/route.ts), [`companies`](../../src/app/api/developer/reset-centre/companies/route.ts) | Session + role + password gate. Re-resolves the company server-side. Calls the RPC. Writes platform audit events. |
| Database | [`supabase/pcp-045-developer-reset-centre.sql`](../../supabase/pcp-045-developer-reset-centre.sql) | `SECURITY DEFINER` functions. All deletes happen here, in one transaction, in dependency order. |

The browser never sees a table name it can act on and never issues SQL. It posts a company ID, a module key, a password and the literal `DELETE`.

### Why the deletes live in Postgres

The Supabase service key reaches the database through PostgREST only. There is no `exec_sql` RPC and no direct connection string in this project, so a JavaScript implementation would issue one HTTP `DELETE` per table with **no transaction** — a failure part-way through would leave exactly the partial state the brief forbids.

Putting the deletes inside a `plpgsql` function makes the whole module atomic: a PL/pgSQL function body runs inside a single implicit transaction, so any exception rolls back every delete in that module.

Both functions declare `set search_path = public`. This is what prevents the `42P01: relation "vyron_cost_bom_lines" does not exist` class of failure seen when running an unqualified `DO` block; every reference is additionally schema-qualified as `public.<table>`.

---

## The reset plan is derived, not hand-written

Hand-maintaining a delete order across 158 tables is how orphans and FK violations happen. The SQL is **generated from the live schema** by three scripts:

```bash
npm run reset:sql     # introspect -> plan -> emit SQL
```

1. **[`introspect-schema.mjs`](../../scripts/introspect-schema.mjs)** reads the PostgREST OpenAPI document, which exposes every table, every column, and every declared foreign key. Output: `data/generated/schema-introspection.json`.
2. **[`generate-reset-plan.mjs`](../../scripts/generate-reset-plan.mjs)** seeds each module with its root tables, then:
   - **closes the set under incoming references** — any table pointing at a doomed row is pulled in, or the delete would FK-violate;
   - **topologically sorts** children before parents;
   - **resolves a company scope for every table**, walking parent chains for tables that have no `company_id`.
3. **[`generate-reset-sql.mjs`](../../scripts/generate-reset-sql.mjs)** emits the migration.

Regenerate after any schema change. The file header says so.

### What the closure found

The naive module lists in the brief would not have worked. The audit surfaced:

- **17 external references** into the delete set from procurement, sales-order, inventory and manufacturing tables (`vyron_cost_purchase_order_lines.ingredient_id`, `vyron_customer_sales_order_items.product_id`, `vyron_manufacturing_batches.product_id`, and others). Each is now included in the relevant module's closure.
- **Three ordering bugs** in a hand-drafted order, including `vyron_supplier_contracts` being deleted after `vyron_documents` which it references.
- **A circular foreign key**: `vyron_cost_products.linked_bom_id → vyron_cost_boms.id` while `vyron_cost_boms.product_id → vyron_cost_products.id`. Broken with an `UPDATE ... SET linked_bom_id = NULL` before either side is deleted.

### Modules are not independent

This is the most important consequence and it contradicts the brief's assumption of independent modules. Because deletion must respect foreign keys, a module's closure drags in its dependants:

| Module | Tables in closure |
|---|---|
| Reset Production History | 9 |
| Reset Raw Materials | 15 |
| Reset Supplier Invoices | 16 |
| Reset BOMs | 20 |
| Reset Finished Goods | 21 |
| **Reset Suppliers** | **31** |
| Factory Reset Costing | 56 |

"Reset Suppliers" cannot delete only suppliers — ingredients, stock items, invoices and purchase orders all reference them. The preview is therefore mandatory: it lists **every** table and row count the module will touch before anything is enabled.

### Scoping

Every delete is scoped to one company. Three mechanisms, chosen per table from the schema:

| Mechanism | Example |
|---|---|
| `company_id` column | `delete from public.vyron_cost_products where company_id = p_company_id` |
| `tenant_id` column | `vyron_documents`, `vyron_supplier_profiles`, `vyron_supplier_invoice_learning` |
| Parent chain subquery | `vyron_cost_supplier_invoice_lines` → `invoice_id in (select id from vyron_cost_supplier_invoices where supplier_id in (select id from vyron_cost_suppliers where company_id = p_company_id))` |

No table in any module resolves to "unscoped".

---

## Deliberately excluded

### Cannot be scoped to a company

These four tables carry no `company_id`, no `tenant_id`, and no parent chain reaching one. Deleting them would cross tenants, so they are **never touched**:

- `vyron_cost_email_invoice_queue`
- `vyron_cost_supplier_benchmarks` — named in Module 6 of the brief; it cannot be safely included
- `vyron_cost_supplier_intelligence`
- `vyron_cost_sales_price_lists`

### Protected by policy

Users, authentication, permissions, roles, workspace configuration, VAT settings, units of measure, currencies, system settings, `vyron_cost_companies`, `vyron_financial_accounts`, and `vyron_document_approval_rules` (per-tenant configuration). The generator refuses to add these to any closure via a protected-name guard.

### Identity reset

Not applicable. Every primary key in scope is a `uuid` with `gen_random_uuid()`. There are no sequences to reset, so no product ID "starts at 590".

---

## Safety model

An operation must clear all five gates:

1. **Authenticated platform session** — `requirePlatformSessionFromRequest`, with idle and absolute session timeouts already enforced by the existing platform auth layer.
2. **`PLATFORM_ADMIN` role** — the strictest of the three platform roles. `PLATFORM_OPERATOR` and `PLATFORM_AUDITOR` are refused.
3. **Developer supervisor password** — verified on *every* request, including preview.
4. **Exact confirmation phrase** — the literal `DELETE`, checked server-side. The button is disabled client-side too, but that is convenience, not security.
5. **Live preview** — execution is refused unless a preview has been run and returned a non-zero count.

### Password handling

- Stored as `VYRON_DEV_RESET_PASSWORD_HASH` in environment configuration, never in source.
- Format `scrypt$<salt>$<hash>`, 64-byte derived key, generated by `npm run reset:password-hash` which reads the password without echo and never writes plaintext.
- Compared with `crypto.timingSafeEqual`, never `===`.
- Verified only in Node route handlers. `vyron-developer-reset.ts` is server-only and imported by no client component.
- Never logged. Rejections record the event and the actor, never the attempt value.
- If the hash is unset, both endpoints return `503` and the feature is inert. **This is the current state.**

### Hard rules, and how each is enforced

| Rule | Enforcement |
|---|---|
| Never touch another company | Every predicate resolves to `p_company_id`; the function raises if the company is unknown |
| Every delete scoped by company | Verified by the plan generator; no table resolves to unscoped |
| Never delete shared reference data | Protected-name guard in the generator |
| Never delete users / auth / settings / config | Same guard, plus explicit `PROTECTED` list |
| Never use `TRUNCATE` | The generator emits only `DELETE ... WHERE` |
| Never execute raw SQL from the browser | The browser posts a module *key*; SQL exists only in the migration |
| Delete in dependency order | Topological sort over the live FK graph |
| Rollback on failure | `plpgsql` function body is atomic per module |

---

## Audit model

Two independent trails.

**`vyron_dev_reset_audit`** (created by the migration) — written inside the same transaction as the deletes, so an audit row exists if and only if the delete committed:

`company_id`, `module`, `actor_user_id`, `actor_email`, `reason`, `rows_deleted` (jsonb, per table), `total_rows_deleted`, `duration_ms`, `status`, `warnings`, `created_at`.

RLS is enabled with no policies: reachable only through `SECURITY DEFINER` functions and the service role.

**`vyron_platform_auth_audit`** (existing) — receives `developer.reset.executed`, `developer.reset.denied` and `developer.reset.failed` events with actor, role, IP and user agent.

The password is recorded in neither.

---

## Result reporting

After execution the endpoint **re-runs the preview** and returns what is still there, rather than asserting success. The UI shows rows deleted, tables affected, duration, and either "rows remaining: 0" or a warning naming the tables that still hold rows.

---

## Validation performed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint` on all new files | clean (one `react-hooks/set-state-in-effect` error found and fixed) |
| `npx next build` | compiled successfully in 57s; 329 static pages generated |
| Routes registered | `/developer/reset-centre`, `/api/developer/reset-centre/{companies,preview,execute}` |
| Schema introspection | 158 tables, 106 with `company_id`, FK graph resolved |
| Plan closure | every table in every module resolves to a company scope |
| Migration applied | **no** — `vyron_dev_reset_preview` returns `PGRST202`, `vyron_dev_reset_audit` returns `PGRST205` |
| End-to-end reset executed | **no** — blocked on the migration and the password hash |

Next.js 16 specifics were taken from the bundled docs per `AGENTS.md`: `middleware` is renamed to `proxy` in this version, and route handlers are uncached by default for non-`GET` methods.

---

## Activation

Three steps, all requiring your action. **Nothing has been run against the database.**

1. **Apply the migration.** Open the Supabase SQL editor and run [`supabase/pcp-045-developer-reset-centre.sql`](../../supabase/pcp-045-developer-reset-centre.sql) in full. It creates the audit table and both functions, and revokes execute from `anon` and `authenticated`.

2. **Set the supervisor password.**
   ```bash
   npm run reset:password-hash
   ```
   Paste the emitted `VYRON_DEV_RESET_PASSWORD_HASH=...` into `.env.local` and into your production environment. Minimum 12 characters, enforced.

3. **Verify against a disposable tenant first.** Sign in as `PLATFORM_ADMIN`, open `/developer/reset-centre`, select one of the `FG Test …` companies, and run a preview then a reset. Confirm the audit row and the "rows remaining: 0" result before pointing it at anything real.

### Recommended before first real use

Take a backup. This tool has no undo; the brief's reversibility requirement is met by database backups, not by the tool itself. The existing `backups/` snapshot format is per-table and not tenant-scoped, so a Supabase point-in-time restore or `pg_dump` is the safer basis for recovery.
