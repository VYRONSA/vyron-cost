# PCP-043 — Kingdom Foods Factory Reset

**Status: ABORTED AT PHASE 1. No data was deleted. No backup was taken. No write of any kind was issued.**

Date: 2026-08-03
Operator: Claude Code
Database: `bzzlhzgfvnnwxjxvpzdk.supabase.co`
Requested target: `9c8b7dd4-178e-4459-a028-d053ac9ebae2`

---

## Phase 1 verdict — FAIL (abort condition met)

The task specifies:

> Verify the tenant before doing anything. Abort immediately if the tenant does not match. Never operate on another tenant.

The tenant does not match. Verification was performed against `vyron_cost_companies`.

| Field | Value |
|---|---|
| `id` | `9c8b7dd4-178e-4459-a028-d053ac9ebae2` |
| `name` | **Metanoia Hospitality (Pty) Ltd** |
| `trading_name` | **Handcrafted Food Products** |
| `contact_email` | `info@handcraftedfoods.co.za` |
| `phone` | `0875501235` |
| `subscription_plan` | Professional |
| `subscription_status` | Setup |
| `currency_code` | ZAR |

**There is no tenant called Kingdom Foods.** A search of all 158 companies for `name ILIKE '%kingdom%' OR trading_name ILIKE '%kingdom%'` returns **zero rows**.

### Kingdom Foods is a supplier, not a tenant

`vyron_cost_suppliers` contains four Kingdom Foods records — all of them *inside* the target tenant:

| Supplier ID | `supplier_name` |
|---|---|
| `21246dae-b1d6-48b6-9f45-9eff1e136e66` | `KINGDOMFOODS` |
| `9253f186-7df1-4225-b6b5-460ef8586e61` | `KINGDOM FOODS INTERNATIONAL (Pty) LtdE` |
| `5879c4d9-be90-4d6e-a3a8-4a822922c0d9` | `KINGDOM FOODS INTERNATIONAL (Pty) Ltd` |
| `7aeff121-5aec-4b47-aba1-22ac94299ab2` | `Kingdom Handcrafted Kiosk` |

The name also appears as a local folder, `Documents/Kingdom Foods Supplier Invoices` — a supplier invoice inbox, consistent with Kingdom Foods being a vendor of Handcrafted Food Products.

### What the reset would actually have destroyed

Live counts scoped to `company_id = 9c8b7dd4-…`:

| Table | Rows |
|---|---|
| `vyron_cost_suppliers` | **326** |
| `vyron_cost_stock_items` | 215 |
| `vyron_cost_ingredients` | 211 |
| `vyron_cost_products` | 51 |
| `vyron_cost_boms` | 34 |
| `vyron_cost_product_cost_lines` | 0 |

The operation would have erased the entire costing environment of Metanoia Hospitality / Handcrafted Food Products — 326 suppliers, of which Kingdom Foods is four — rather than clearing anything called "Kingdom Foods".

---

## Two further blockers, independent of the tenant question

### 2. The environment cannot be verified, so the repository's own rules classify it as Production

`npm run safety:env` reports:

```
Environment:  UNKNOWN
Verified:     NO
Confidence:   none  (0/3 signals resolved)
```

All three signals are unresolved: `VYRON_ENV` is unset, Supabase project `bzzlhzgfvnnwxjxvpzdk` is listed but its environment is unresolved, and `NEXT_PUBLIC_APP_URL` is unset. The harness states: *"Execution is NOT SAFE until the environment is verified. Hardening Plan Rule 4: an environment that cannot be proven is treated as Production."*

The brief asserts the tenant is not live. The database in front of me cannot confirm that, and the repository's own safety programme forbids destructive execution in this state.

### 3. Transactional execution is not achievable with the available access

The brief requires work "inside database transactions where practical", with no partial clearing and no orphan rows. Available access is the Supabase service-role key over PostgREST only. Confirmed by probe:

| RPC | Result |
|---|---|
| `exec_sql` | `PGRST202` — not found |
| `run_sql` | `PGRST202` — not found |
| `execute_sql` | `PGRST202` — not found |

No `DATABASE_URL` or direct Postgres connection string is present in `.env.local`. Consequences:

- **No transactions.** Every delete is a separate HTTP request. A failure part-way through leaves precisely the partial state the brief forbids.
- **Phase 3 cannot be satisfied.** `information_schema` is not reachable through PostgREST, so the foreign-key dependency order cannot be read from the live schema. The brief says "Do not guess. Read the schema." Deriving the order from the `.sql` files in `supabase/` would be a guess — those files are already known to drift from the live schema (`vyron_cost_products.sku` exists live but appears in no DDL file).

---

## To proceed, one of these is needed

1. **Confirm the real intent and target.** If the goal is to remove Kingdom Foods *supplier* data (the four supplier records plus their invoices, price lists and extraction artefacts) from Handcrafted Food Products, that is a scoped supplier purge — a different and far smaller operation than a tenant factory reset, and one I can plan and dry-run safely.
2. **If a full tenant reset of Handcrafted Food Products is genuinely intended**, confirm that company name explicitly, since it is not the name in the brief.
3. **For either path, supply a direct Postgres connection string** (Supabase → Project Settings → Database → Connection string) so the work runs in real transactions with live schema introspection, and **set `VYRON_ENV`** so the safety harness can verify the environment.

---

## Audit summary

| Item | Result |
|---|---|
| Rows deleted | **0** |
| Tables modified | **none** |
| Writes issued | **none** |
| Backup taken | none — not reached; Phase 1 aborted first |
| Phases completed | Phase 1 (verification) only |
| Phases not started | 2, 4, 5, 6, 7, 8 |
| Phase 3 | attempted; not completable via PostgREST |
