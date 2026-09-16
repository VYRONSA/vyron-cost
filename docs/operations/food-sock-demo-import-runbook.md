# Food Sock Meals — demo import runbook

Operator procedure for loading the Food Sock Meals demo scope into VYRON
production. **Nothing in this document has been executed.** Steps marked
**WRITE** must not run until every gate in §1 is closed. Everything else is
read-only.

Tooling: `scripts/food-sock-migration.mjs` (planner, reports, gated executor),
`scripts/food-sock-rehearsal.mjs` (in-memory dress rehearsal),
`src/lib/data-migration/*`.

**Client data stays out of this repository.** The client's files stay
external. Exact client values — source-file hashes, the featured product, the
demo procurement order, expected balances and the open client questions — are
in the operator pack, `.migration-reports/food-sock/release/OPERATOR-PACK.md`,
with the demo configuration `demo-config.json` beside it. `.migration-reports/`
is git-ignored. This runbook refers to them as `‹pack: …›`.

---

## 1. Gates

| # | Gate | Owner |
|---|------|-------|
| 1 | Database identity verified (§3) | Platform admin |
| 2 | Food Sock owner confirmed: first name, surname, email, mobile, login method | Client / account owner |
| 3 | Package and user limit confirmed (console defaults `Professional` / `5` are not approvals) | Commercial owner |
| 4 | Family P formally approved and applied (§2) | RSP programme owner + engineering lead |
| 5 | Production database added to the approved allowlist (§2) | Reviewer of permission changes |
| 6 | Tenant created and its company ID verified (§4) | Platform admin |
| 7 | Source-file hashes verified (§6.4) | Operator |
| 8 | Migration `20260910170000` applied (§5) | Operator |
| 9 | Tenant-specific dry run (§6.5) | Operator |
| 10 | Plan hash reviewed and approved for scope `demo` (§6.6–6.7) | Named approver |
| 11 | Wrapped production execution (§6.8) | Operator |
| 12 | Reconciliation (§6.9) | Operator |
| 13 | Read-only `--validate` (§6.10) | Operator |
| 14 | Second dry run proves zero further creates (§6.11) | Operator |

Until gates 1–10 are closed there are **zero** Food Sock production writes.
The tooling enforces this: without gates 4–5 the safety programme's verdict is
PROHIBITED and the CLI refuses; without gate 10 it has no hash, scope-bound
acknowledgement or approver to accept.

The repository disagrees with itself about which Supabase project is
production: the local `.env.local` and Supabase CLI link, `.env.example` and
Hardening Plan §13.1 each name a different project. Only the production app
itself settles it (§3). The verified ref is recorded in the git-ignored Gate 1
checklist, never here; this runbook calls it `<VERIFIED_PRODUCTION_DB_REF>`.

---

## 2. Safety-programme position (gates 4–5)

- The Repository Safety Programme governs validation assets. It permits
  Production for Family A only; B, C and D are prohibited there with no
  approval path (Hardening Plan §3.1). No approved mechanism for a production
  data operation exists.
- Proposal, not applied: `docs/proposals/safety-family-p-production-data-operation.patch`
  — Family P, permitted only in a *verified* production environment (never by
  Rule 4), with a named approver and the typed acknowledgement
  `RUN FOOD-SOCK-MIGRATION AGAINST PRODUCTION WITH NO-EXTERNAL`; irreversible
  effects declared; `food-sock-migration` reclassified C → P. Its self-test
  passed 138/138 in a disposable worktree. Families A–D are unchanged.
- After gate 1, the allowlist entry (a reviewed change):

```json
"<VERIFIED_PRODUCTION_DB_REF>": {
  "environment": "production",
  "unresolved": false,
  "confirmedBy": "<name>",
  "confirmedAt": "<ISO date>",
  "evidence": "<how gate 1 was proven>"
}
```

Leave the other two refs unchanged unless their environment is also proven.
`.env.local` must not set `NEXT_PUBLIC_APP_URL` to a localhost host during
execution — the programme would see a split target and refuse.

---

## 3. Database identity (gate 1) — read-only

1. Sign in to `https://vyron-cost-ikiv.vercel.app` as `PLATFORM_ADMIN`
   (or `PLATFORM_OPERATOR` / `PLATFORM_AUDITOR`) and open
   `/api/documents/tenant-debug`. `debug.supabaseHost` must be exactly
   `<VERIFIED_PRODUCTION_DB_REF>.supabase.co` — the production project proven
   at Gate 1 and recorded in the git-ignored Gate 1 checklist. Record who
   checked and when.
2. Cross-check: Vercel → team `vyronsa` → project `vyron-cost-ikiv` →
   Settings → Environment Variables → **Production**
   `NEXT_PUBLIC_SUPABASE_URL` (a public URL, not a secret).
3. Every database mode of the CLI takes `--expect-database <ref>` and refuses,
   before any client exists, if `.env.local` points elsewhere.
4. After gate 5: `VYRON_ENV=production npm run safety:env` must report
   `Environment: PRODUCTION`, `Verified: YES`.

Any mismatch: **stop**.

---

## 4. Tenant creation (gates 2, 3, 6) — WRITE, normal flow only

`/developer` → **Create client** → `POST /api/developer/clients`
(`PLATFORM_ADMIN` or `PLATFORM_OPERATOR`) → `createClientWorkspace`
(`src/lib/vyron-saas-workspace.ts:770`).

| Form field | Value | Stored as |
|---|---|---|
| Company name | `Food Sock Meals (Pty) Ltd` | `vyron_cost_companies.name`, `vyron_workspaces.company_name` |
| Trading name | ☐ from the client, or blank (defaults to company name) | `trading_name` |
| Package | ☐ gate 3 | `subscription_plan`, `package_name` |
| User limit | ☐ gate 3 | `vyron_workspaces.user_limit` (blank → 5) |
| Contact email / phone | ☐ gate 2 (blank email → owner email) | `contact_email`, `phone` |
| Administrator first name, surname, email, mobile | ☐ gate 2 | auth user, `vyron_user_profiles`, owner membership, `vyron_cost_users` (OWNER) |
| Login method | ☐ gate 2: `invite` emails a Supabase invitation; `password` needs ≥ 8 characters + confirmation | auth status Invited / Active |

It creates company (Setup) → workspace (Setup) → auth user → profile → owner
membership → `vyron_cost_users` row, and removes the company and workspace if
owner provisioning fails. It seeds no master data.

Verify (read-only): the response says `Invitation email sent to …` or
`LOGIN ACTIVE — …`, never `NO LOGIN CREATED`; exactly one company and one
workspace exist for the name (record the company id as `<ID>`); package, user
limit and owner match gates 2–3; the owner email was not already a VYRON user.

```sh
node -e "const fs=require('fs');const e=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).replace(/^\"|\"$/g,'')]));const s=require('@supabase/supabase-js').createClient(e.NEXT_PUBLIC_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});Promise.all([s.from('vyron_cost_companies').select('id,name,subscription_plan,subscription_status').eq('name','Food Sock Meals (Pty) Ltd'),s.from('vyron_workspaces').select('id,company_id,package_name,user_limit,status,owner_email,owner_login_status').eq('company_name','Food Sock Meals (Pty) Ltd')]).then(([c,w])=>console.log(c.error||c.data,w.error||w.data))"
```

---

## 5. Schema migration (gate 8) — WRITE, additive

`supabase/migrations/20260910170000_vyron_import_source_links.sql` creates one
table, `vyron_import_source_links`: unique key `(company_id, source_system,
source_entity, source_key)`, non-blank check on `source_key`, two indexes, RLS
enabled with no policies (service role only). `company_id` references
`vyron_cost_companies(id) on delete cascade`. It alters, drops, deletes and
updates nothing; `if not exists` makes a repeat a no-op; the table is empty
when created, so the foreign key validates instantly (a brief lock on
`vyron_cost_companies`). Safe for every existing tenant and before Food Sock
data exists.

```sh
npx supabase migration list --linked      # 20260910170000 must be the ONLY local-only row
npx supabase db push --linked --dry-run   # must list 20260910170000 and nothing else
npx supabase db push --linked
npx supabase migration list --linked      # now Local and Remote
```

---

## 6. Import sequence

`<ID>` from §4; `<dir>` holds the eleven client files; `<REF>` is the ref
proven in §3; `<PACK>` is `.migration-reports/food-sock/release`.

**6.1 Database identity** — §3.

**6.2 Tenant identity** — the §4 lookup returns exactly one company and one
workspace for `<ID>`.

**6.3 Schema** — `20260910170000` applied; 6.5's output must not contain
`source links unavailable`.

**6.4 Source hashes** — `sha256sum` each file in `<dir>` and compare with
‹pack: Source files›. The plan hash is computed over these hashes, so an
approved hash cannot be reused with different files.

**6.5 Tenant-specific dry run (read-only)**

```sh
VYRON_ENV=production node scripts/food-sock-migration.mjs --sources <dir> \
  --company <ID> --expect-database <REF> --scope demo \
  --verify-deterministic --demo-report --demo-config <PACK>/demo-config.json
```

Expected on the fresh tenant: 31 demo-ready products and

| table | rows | table | rows |
|---|---:|---|---:|
| vyron_cost_suppliers | 16 | vyron_cost_boms | 31 |
| vyron_contacts | 16 | vyron_cost_bom_lines | 348 |
| vyron_cost_categories | 8 | vyron_cost_stock_ledger | 51 |
| vyron_cost_ingredients | 51 | vyron_inventory_audit_log | 82 |
| vyron_cost_stock_items | 82 | vyron_import_source_links | 180 |
| vyron_cost_products | 31 | vyron_import_runs | 1 |

**6.6 Plan hash capture** — record `<H>` (and `<H12>`, its first 12
characters) from 6.5. It is bound to `<ID>`, the tenant's current contents and
the source hashes. The generic new-tenant hash (‹pack›) is refused, and so is
any hash from before the tenant last changed.

**6.7 Named approval** — the approver reads `summary.md` and
`demo-report-demo.json` under `.migration-reports/food-sock/<H12>/` and
approves `<H>`, **scope `demo`**, for `<ID>`, by name.

**6.8 Controlled execution — WRITE** (gates 1–10 closed)

```sh
VYRON_ENV=production VYRON_ACKNOWLEDGE_PRODUCTION_WRITE=1 \
node scripts/safety/run.mjs food-sock-migration \
  --approver "<approver>" \
  --acknowledge "RUN FOOD-SOCK-MIGRATION AGAINST PRODUCTION WITH NO-EXTERNAL" \
  --report .migration-reports/food-sock/safety-<ID>.json \
  -- --sources <dir> --company <ID> --expect-database <REF> --scope demo \
     --approve-plan-hash <H> --approver "<approver>" \
     --acknowledge "IMPORT FOOD SOCK PLAN <H12> SCOPE demo INTO <ID>" --execute
```

Refused before any database access on: an environment that is not verified
production; a database other than `<REF>`; no explicit `--scope`; no approver;
an acknowledgement that does not name exactly this plan, **scope** and tenant;
the environment acknowledgement missing; a PROHIBITED safety verdict. Refused
before any write if the plan rebuilt against the tenant does not hash to `<H>`.
The executor repeats the hash, tenant, scope, approver and acknowledgement
checks itself, so they hold even if the CLI is bypassed.

Audit record: the `vyron_import_runs` row (`company_id` = tenant) carries, as
the first `error_report` entry, `{kind: "execution_approval", tenant_id,
plan_hash, scope, approver, acknowledgement, started_at, finished_at, result,
record_totals, reconciliation_findings}`; `status` holds the result. The
wrapper's safety report records the approver and token.

All prerequisites are checked before the first write. The import is not one
database transaction: an infrastructure failure part-way leaves the records
written so far, each linked to its source; the run ends "Completed with
issues", and a re-run with the same approval resumes without duplicating.

**6.9 Reconciliation** — no failed record, zero reconciliation findings, no
global change outside `<ID>`, run status `Completed`, exit code 0.

**6.10 Read-only validation**

```sh
VYRON_ENV=production node scripts/food-sock-migration.mjs --sources <dir> \
  --company <ID> --expect-database <REF> --scope demo --validate
```

Every table equals the forecast, and every stage of the record reconciliation
reads `N of N present, 0 missing, 0 shared rows`: each scope record resolves to
its own existing row by the executor's identity rules (source link; exact name
and type for categories; the item's stock item for an opening balance; the
finished product's BOM). Run it before any demo transaction.

**6.11 Second dry run** — repeat 6.5: every demo-scope record is a match,
nothing in the scope to create (records outside the demo scope still show as
create). Its hash differs from the approved one because the tenant is no
longer empty. Do not execute this second plan.

No automated rollback exists and nothing is ever deleted by this tooling.
Every imported row is identified by `vyron_import_source_links` and its run in
`vyron_import_runs`. If rows are later removed outside this tool, a re-run
fails those records rather than silently re-creating them.

---

## 7. Demo transactions and acceptance

The featured product, its 13 components and every expected balance, the demo
procurement order (the client's own last real order for the limiting
component) and the production result are in ‹pack: Demo acceptance
criteria›. The rehearsal reproduces them locally:

```sh
node scripts/food-sock-rehearsal.mjs --sources <dir> --demo-config <PACK>/demo-config.json
```

It must pass 36/36. The finished-goods ledger row reads `Purchase` — a known
label defect with a separate, unapplied patch
(`docs/proposals/production-completion-movement-type.patch`). Imported BOMs
stay Draft. The open client questions stay unresolved (‹pack: Open client
questions›); none of them affects purchasing, costing or production.

---

## 8. Stop conditions

Stop if: any gate is open; the database identity disagrees anywhere; the
safety verdict is anything but `requires-approval`; a source hash differs;
any migration other than `20260910170000` is pending; the tenant lookup
returns other than one company; the plan hash, scope or tenant differs from
the approval; execution reports a failure, a reconciliation finding or a
change outside `<ID>`; validation reports a difference.
