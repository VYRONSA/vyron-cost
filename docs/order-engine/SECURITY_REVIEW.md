# Order Engine — Security Review (2026-09-22)

Scope: the Order Engine (`src/lib/order-engine`, `/api/order-intake/*`,
`/order-inbox/*`, migrations `20260922120000` and `20260922130000`) and the
existing sales-order, invoice and VYRON ORDER code it integrates with.
Method: code review plus negative tests through the real route handlers,
session, membership and company resolution; database constraints proven on a
disposable Postgres.

## 1. Findings fixed

| # | Area | Finding | Fix | Proof |
|---|---|---|---|---|
| S1 | Audit identity | 7 sales-order and invoice routes recorded a **request-body actor** as approver / poster / creator | actor derived from the verified session (`vyron-audit-actor.ts`); body ignored | `test:sales-order-safety` §1, §5 (static guard) |
| S2 | Audit identity | Order Centre recorded a fixed label, not the person | records the member | `test:sales-order-safety` §1 |
| S3 | Authorisation | `/api/vyron-order/admin/access` required only a session: **any member (even view-only) could set a customer's portal PIN**, suspend access or change the public ordering link | `customers.view` to read, `customers.edit` to change | `test:sales-order-safety` §4 |
| S4 | Information exposure | a validation message quoted the **unit cost** to members without cost permission | margin messages carry no figures; margin issues, event metadata, line costs and totals redacted for non-approvers | `test:order-engine-routes`, `test:order-engine-controls` (redaction), browser review of the clerk view |
| S5 | Tenant consistency (DB) | a line, event or message link could reference another company's order | composite `(id, company_id)` foreign keys | `test:order-engine-migration-pg` |
| S6 | Tenant consistency (DB) | a referenced inbound message could be deleted (silently unlinking orders) | company-checked key without `SET NULL` | `test:order-engine-migration-pg` |
| S7 | Request hygiene | mutations accepted any content type and unbounded bodies | JSON only (415), 3 MB limit (413), malformed JSON 400 | `test:order-engine-permissions` |
| S8 | Filter injection | inbox search is embedded in a PostgREST `or` filter | search reduced to letters, digits and `. _ / # -` | `test:order-engine-controls` |
| S9 | Data minimisation | exception-resolution lookup returned prices and e-mail addresses | names and SKUs only | code review |
| S10 | Double reservation | sales-order approval ignored other orders' reservations | live reservations netted | `test:sales-order-safety` §3, `test:order-engine-concurrency` §15 |

## 2. Verified (no change needed)

| Check | Result | Proof |
|---|---|---|
| Authentication on every Order Engine route | anonymous → 401 on all 19 endpoints/actions | `test:order-engine-permissions` |
| Authorisation per action | 10 roles × 19 endpoints match RBAC; server-enforced independent of buttons | same |
| Tenant isolation / IDOR | another tenant's order, mapping, policy, exception → 404 / not listed; foreign customer/product ids refused; company never read from the request; conflicting company cookie refused | `test:order-engine-routes`, `-permissions`, `-controls`, domain suite |
| Approval spoofing | approval needs `sales_orders.approve` from the session; body `actor`, `companyId`, `created_by` ignored | `test:order-engine-routes` |
| Order / customer / product id manipulation | every id is re-checked inside the company before use | domain suite, routes suite |
| Replay / duplicates | source identity unique per company; duplicate content returns the existing order; different content for the same key refused | concurrency suite, pg suite |
| CSV injection | formula prefixes neutralised on import (also behind spaces) | controls suite |
| XSS | all order/customer text rendered through React (escaped); no `dangerouslySetInnerHTML` / `innerHTML` in Order Engine code | code search |
| CSRF | session cookie `SameSite=Lax`, `HttpOnly`, `Secure` in production; mutations require `application/json` (a cross-site form cannot send it without a CORS preflight, which is never granted) | code review; 415 test |
| Attachments | no Order Engine route accepts files; the e-mail boundary stores attachment metadata only, never bytes | code review, controls suite |
| Source spoofing | the API creates only `manual` (forced, whatever the body says) or `csv` orders; platform and e-mail sources exist only as server functions | routes suite, manual-adapter test |
| Secrets in logs | telemetry allow-lists identifiers, statuses, counts and codes; names, notes, e-mails and prices are dropped | controls suite |
| Database access | all Order Engine tables: RLS on, no policies, no grants to `anon` / `authenticated` | pg suite |

## 3. Open — recorded, not changed

| # | Finding | Why not changed here | Recommended |
|---|---|---|---|
| O1 | 26 other API routes still read a client-supplied actor: documents/[id]/link-po; goods-receipts (2); integrations/xero accounts, connection, import-contacts, mapping, sync-queue; inventory-transactions; inventory/alerts/create-po; inventory/counts/[id]; procurement-requisitions; production/runs (+ approve, cancel, complete, reverse, start); purchase-orders/[id] (+ archive, attachments, receive); store-orders/[id]/status and /workflow; store-production-runs (2) | some fields may legitimately name a different person (e.g. the operator who completed a run, the person who received goods) — each needs a business decision, not a blanket change | a dedicated phase: per route, session actor for "who did this in VYRON", with any named operator kept as a separate labelled field |
| O2 | Legacy tables are readable/writable with the public anon key (platform-wide, known since 2026-09-14) | outside the Order Engine; production DDL | the planned RLS remediation phase; the Order Engine tables are not affected (no grants) |
| O3 | Sales-order approval reserves stock read-then-write; two different orders approved at the same instant could both pass | needs a database lock (RPC) | transactional reservation RPC |
| O4 | No separation of duties (SALES may receive and approve the same order) | RBAC has no such concept; client policy | optional "approver ≠ creator" rule per company |
| O5 | No rate limiting on order creation | platform-wide concern | edge / middleware rate limit before any public source is connected |
| O6 | Future e-mail webhook must verify signatures and resolve the company from the receiving address | not built | see `ORDER_SOURCE_ADAPTERS.md` §5 |

## 4. How to re-run the evidence

```
npm run test:order-engine            # domain
npm run test:order-engine-routes     # API security & workflow
npm run test:order-engine-permissions
npm run test:order-engine-controls
npm run test:order-engine-concurrency
npm run test:order-engine-fixtures
npm run test:sales-order-safety
PGURL=postgres://…@127.0.0.1:…/postgres npm run test:order-engine-migration-pg   # local disposable Postgres only
```
