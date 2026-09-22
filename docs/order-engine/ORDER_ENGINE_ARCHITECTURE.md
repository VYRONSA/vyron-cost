# VYRON COST — Order Engine Architecture

Status: **implemented and tested on branch `feat/order-engine-foundation`; neither migration is applied to any live database; not merged, not deployed.**
Revision 2 (2026-09-22): mappings, customer policies, Exception Centre, source facts, concurrency proof, existing-engine fixes — see §15–§19 and the companion documents.
Date: 2026-09-22

This document is the design record for the Order Engine. Every section says
whether the capability is **IMPLEMENTED NOW** or **DESIGNED FOR LATER**. Nothing
marked "later" exists in code; nothing marked "now" is a mock.

---

## 1. Purpose and the one architectural decision

VYRON COST already contains a complete, tenant-scoped **sales-order engine**
(`src/lib/vyron-customer-sales-orders.ts`): a 9-state lifecycle
(`Draft → Awaiting Approval → Approved → Picking → Packed → Dispatched →
Partially Invoiced → Invoiced`, plus `Cancelled`), stock reservation, production
run and procurement requisition generation, invoice conversion, and its own
audit table. On top of it sit the **VYRON ORDER** customer portal
(`/order/[tenant]`) and the **Order Centre** (`/order-centre`), which is
explicitly a read model and uses `transitionCustomerSalesOrder` as "the only
state machine".

What does not exist is everything *before* a sales order: receiving an order
from an outside source, matching the customer and products deterministically,
validating it, raising exceptions, and getting a human decision **before** a
commercial document exists.

**Decision: the Order Engine is an intake layer in front of the existing
sales-order engine, not a second order engine.**

```
 SOURCES                      ORDER ENGINE (new)                       EXISTING ENGINE (unchanged)
 ─────────                    ──────────────────                       ───────────────────────────
 Manual entry  ─┐
 CSV / XLSX    ─┤  adapter    ┌──────────────┐  validate  ┌─────────┐  approve  ┌──────────────┐
 Email*        ─┼──────────▶  │ Order intake │ ─────────▶ │Exception│ ────────▶ │ Sales order  │ → pick → pack →
 WooCommerce*  ─┤  normalise  │  RECEIVED    │            │ Awaiting│  confirm  │   (Draft)    │   dispatch → invoice
 Shopify*      ─┤             └──────────────┘            │ approval│           └──────────────┘   → optional Xero
 API / EDI*    ─┘                                         └─────────┘
                                   * adapter boundary only — not connected
```

Consequences:

- The confirmed-order lifecycle, stock reservation, production, invoicing and
  Xero are **reused, not rewritten**. Their behaviour is unchanged.
- The intake approval is the commercial gate for externally-received orders. The
  sales order it creates is a `Draft`; the existing engine's own submit/approve
  rules (GP, discount, credit limit, stock reservation) still apply when staff
  progress it. Nothing is posted, reserved, invoiced or sent to Xero by the
  Order Engine.
- **Historical e-commerce sales are out of scope** for this layer. They belong in
  the separate provenance-aware external-sales domain designed in the Food Sock
  Phase 2 assessment. An adapter here only ever produces an *operational*
  intake.

---

## 2. Order lifecycle — IMPLEMENTED NOW

### 2.1 Four separate status dimensions

| Dimension | Stored where | Values |
|---|---|---|
| **Order (intake) status** | `vyron_order_intakes.status` | `RECEIVED`, `EXCEPTION`, `AWAITING_APPROVAL`, `ON_HOLD`, `APPROVED`, `CONFIRMED`, `REJECTED`, `CANCELLED` |
| **Approval status** | derived from intake status | `PENDING`, `ON_HOLD`, `APPROVED`, `REJECTED`, `NOT_APPLICABLE` |
| **Fulfilment status** | derived from the linked sales order | `NOT_STARTED`, `IN_PROGRESS`, `DISPATCHED`, `CANCELLED`, `NOT_APPLICABLE` |
| **Invoice status** | derived from the linked sales order | `NOT_INVOICED`, `PARTIALLY_INVOICED`, `INVOICED`, `NOT_APPLICABLE` |

Fulfilment and invoice status are **never stored twice**: once an intake is
confirmed, the sales order is the single source of truth and the intake reads
it. This avoids the drift a copied status would suffer.

Rejected from the brief's candidate list, with reasons:

- `DRAFT` — identical to `RECEIVED` (editable, not yet validated). One state.
- `PARSING`, `VALIDATING` — processing is synchronous; a transient state that
  no user ever sees is status explosion. Parse/validate timestamps and events
  record them instead.
- `FULFILLING`, `PARTIALLY_FULFILLED`, `FULFILLED`, `INVOICED` — owned by the
  sales-order engine (derived fulfilment/invoice status above).

### 2.2 State machine

| Action | From | To | Permission |
|---|---|---|---|
| receive (create) | — | `RECEIVED` | `sales_orders.create` |
| edit (customer / lines / match) | `RECEIVED`, `EXCEPTION` | `RECEIVED` | `sales_orders.edit` |
| validate | `RECEIVED`, `EXCEPTION` | `AWAITING_APPROVAL` or `EXCEPTION` | `sales_orders.create` |
| approve | `AWAITING_APPROVAL` | `APPROVED` → `CONFIRMED` | `sales_orders.approve` |
| confirm (retry handoff) | `APPROVED` | `CONFIRMED` | `sales_orders.approve` |
| hold | `AWAITING_APPROVAL` | `ON_HOLD` | `sales_orders.approve` |
| release | `ON_HOLD` | `AWAITING_APPROVAL` or `EXCEPTION` (re-validated) | `sales_orders.approve` |
| request changes | `AWAITING_APPROVAL`, `ON_HOLD` | `RECEIVED` | `sales_orders.approve` |
| reject | `AWAITING_APPROVAL`, `ON_HOLD`, `EXCEPTION` | `REJECTED` (terminal) | `sales_orders.approve` |
| cancel | `RECEIVED`, `EXCEPTION`, `AWAITING_APPROVAL`, `ON_HOLD` | `CANCELLED` (terminal) | `sales_orders.edit` |

Rules:

- `hold`, `reject`, `request changes` and `cancel` require a reason.
- **Approve re-validates** against live data first. New blocking issues move the
  intake to `EXCEPTION` and the approval is refused. The validation the approver
  saw must still be current (a content hash is compared); if anything changed,
  the approval is refused.
- If warnings exist, the approver must explicitly acknowledge them; the
  acknowledgement and the warning codes are written into the approval event.
- Every transition is an **optimistic compare-and-set** on
  `(id, company_id, status, version)`. Two approvers racing on the same order
  cannot both win.
- `APPROVED` is normally transient: approve immediately performs the handoff.
  An intake stays `APPROVED` only if the handoff failed (for example the
  workspace VAT rate is not configured); `confirm` retries it idempotently.

Permissions reuse the existing `sales_orders.*` keys. No new permission was
invented: the catalogue already has `sales_orders.approve`, held by default by
OWNER, ADMIN, SUPERVISOR/MANAGER and SALES. **Separation of duties** (a creator
may not approve their own order) is not enforced today because existing RBAC does
not model it — DESIGNED FOR LATER (see §15).

---

## 3. Data model — IMPLEMENTED NOW (migrations written, not applied)

> Revision 2: `20260922130000_vyron_order_intake_hardening.sql` adds composite
> tenant keys, `vyron_order_product_aliases`, `vyron_order_customer_identities`
> (revoke-only), `vyron_customer_order_policies`, and shipping / tax-inclusive /
> extraction columns. Proven by `test:order-engine-migration-pg`.

Migration: `supabase/migrations/20260922120000_vyron_order_intake.sql`.
Additive only — four new tables; **no existing table is altered**.

```
vyron_order_source_messages (email etc.)
        │ 0..1
        ▼
vyron_order_intakes ──1:n──▶ vyron_order_intake_lines
        │ 1:n
        ├──────────────────▶ vyron_order_intake_events (append-only audit)
        │ 0..1  sales_order_id (logical link, unique)
        ▼
vyron_customer_sales_orders (existing, unchanged)
```

### 3.1 `vyron_order_intakes` (order header)

Identity and provenance: `id`, `company_id`, `intake_number` (unique per
company), `source`, `source_key`, `source_reference`, `source_message_id`,
`source_status`, `content_hash`.

Commercial header: `external_order_number`, `customer_po_number`,
`customer_id` (only when deterministically resolved), `customer_name`
(as received), `customer_reference` (raw account code / e-mail / external id),
`customer_match_rule`, `order_date`, `requested_delivery_date`, `currency`,
`delivery_address`, `contact_name`, `notes`.

Amounts **as supplied by the source** (never recalculated over the top):
`supplied_subtotal`, `supplied_discount_total`, `supplied_tax_total`,
`supplied_total`.

Validation: `validation` (jsonb snapshot of issues, per-line results and
expected totals), `validation_hash`, `validated_at`, `blocking_issue_count`,
`warning_issue_count`.

Decision and handoff: `decision_by`, `decision_at`, `decision_note`,
`pending_sales_order_id`, `sales_order_id` (unique), `created_by`, `version`,
`created_at`, `updated_at`.

The brief's `subtotal / discount / tax / total` on the header are represented
twice on purpose: `supplied_*` (what the customer sent) and the expected totals
inside `validation` (what VYRON computes). The difference is itself a
validation signal.

### 3.2 `vyron_order_intake_lines`

`line_no`, `source_line_reference` (unique per intake when present), raw values
(`raw_sku`, `raw_description`, `raw_unit`, `quantity`, `unit_price`,
`discount_amount`, `tax_amount`, `line_total` — all as received), and the
matching result (`product_id`, `match_status`, `match_rule`,
`match_candidates`, `matched_by`, `matched_at`) plus `validation_status`.

### 3.3 `vyron_order_intake_events` — audit

`event_type`, `actor` (server-set, never from a request body), `actor_name`,
`from_status`, `to_status`, `detail`, `metadata`, `created_at`. **Append-only**
by trigger: no update, and no delete except through the intake's own cascade.

### 3.4 `vyron_order_source_messages` — inbound message envelope

`channel` (`email`), `provider`, `message_id` (unique per company + channel),
`from_address`, `to_addresses`, `cc_addresses`, `subject`, `received_at`,
`body_text`, `attachments` (metadata only: filename, content type, size,
sha-256, storage path), `processing_status`, `processing_error`, `intake_id`.

### 3.5 Why not reuse …

| Existing structure | Decision |
|---|---|
| `vyron_customer_sales_orders` / lines | **Reused as the downstream target**, not as the intake: it has no source, PO, external reference, match status or exception state, and adding them would change an engine that the portal and Order Centre depend on. |
| `vyron_customer_order_submissions` | Pattern reused (idempotency key + link to sales order). Portal-specific (keyed on customer), so not reused as the table. |
| `vyron_import_source_links` | **Not used for orders.** It maps a source key to an existing VYRON master row (`entity_id not null`), cannot express "unmatched", and — per the 2026-09-15 production check — does not exist in the live database. The intake's own unique `(company_id, source, source_key)` is the provenance and idempotency key. |
| `vyron_documents` | Reused later for order attachments (PDF/XLSX storage) — see §9. |
| `vyron_customer_sales_order_audit` | Still written on handoff (a `CREATED_FROM_ORDER_INTAKE` event with the real actor). The intake has its own event table because an intake exists before any sales order does. |
| `/approvals` (`vyron_cost_approvals`) | Rejected: written from the browser with the anon key and a literal `"Current User"` actor. |

---

## 4. Order source abstraction — IMPLEMENTED NOW (interface + safe adapters)

```ts
interface OrderSourceAdapter<Raw> {
  readonly source: OrderSource;          // manual | csv | xlsx | email | woocommerce | shopify | …
  readonly connected: boolean;           // false for every external platform today
  normalize(raw: Raw): OrderCandidate;   // pure: receive → parse → normalise
}
```

An `OrderCandidate` is the one shape every source produces: header fields,
`sourceKey` (idempotency), `sourceReference`, `supplied` amounts, and
`lines[]` with raw SKU/description/quantity/price/discount/tax/line total and an
optional `sourceLineReference`. Adapters never match, price or decide anything —
they only translate.

| Adapter | State |
|---|---|
| Manual entry | IMPLEMENTED — UI form |
| CSV (strict headers) | IMPLEMENTED — uses the existing `vyron-csv-parser` (formula-injection neutralised) |
| Email | IMPLEMENTED as a service boundary + deterministic test adapter; **no mailbox or provider is connected** |
| WooCommerce / Shopify | IMPLEMENTED as pure normalisers of the platforms' documented order JSON; **not connected**, `connected: false`, no credentials anywhere |
| XLSX | DESIGNED FOR LATER — same tabular mapper as CSV once the upload path is server-side (the UI asks for Excel to be saved as CSV) |
| PDF | DESIGNED FOR LATER — §9 |
| API / EDI | DESIGNED FOR LATER — §11 |

---

## 5. Customer identification — IMPLEMENTED NOW

Deterministic ladder, first decisive rung wins, always within the company:

1. **Explicit customer id** (chosen in the UI) — must exist in the company.
2. **Exact normalised name** (trim, case-fold, collapsed whitespace) equal to
   exactly one customer.
3. **Sender e-mail** (e-mail source only) equal to exactly one customer's
   `email` or `invoice_email` — matched, but raised as a **warning** the approver
   must acknowledge.

More than one candidate → `CUSTOMER_AMBIGUOUS` (blocking). None →
`CUSTOMER_NOT_FOUND` (blocking). No fuzzy, partial or "contains" match ever
resolves a customer.

---

## 6. Product / SKU matching — IMPLEMENTED NOW

> Revision 2: the ladders now include this customer's approved aliases (rung 1)
> and remembered customer references; the current ladders are in
> `VALIDATION_RULES.md` §3.

Deterministic ladder per line. Result is exactly one of `MATCHED`, `UNMATCHED`,
`AMBIGUOUS`:

| Rung | Rule | Outcome |
|---|---|---|
| 0 | Explicit product id (manual resolution) | must exist in the company, else blocking |
| 1 | Existing external id | **DESIGNED FOR LATER** (needs a product source-link table in the live DB) |
| 2 | Exact SKU (`sku === raw`) | 1 → MATCHED `sku_exact`; >1 → AMBIGUOUS |
| 3 | Normalised SKU (trim + upper-case) | 1 → MATCHED `sku_normalized`; >1 → AMBIGUOUS |
| 4 | Approved alias (`vyron_customer_item_mappings.source_item_code`) | 1 product → MATCHED `alias`; >1 → AMBIGUOUS; table absent → rung skipped |
| 5 | Exact normalised name — **only when the line has no SKU** | 1 → MATCHED `name_exact` **plus a warning**; >1 → AMBIGUOUS |
| 6 | Nothing | UNMATCHED → blocking exception; a person resolves it by choosing the product (rung 0, audited) |

A line that carries a SKU which is not found is **UNMATCHED** — it never falls
through to a name match. Candidates for AMBIGUOUS lines are stored so the
reviewer chooses between exactly those products.

Database queries use a bounded case-insensitive filter and then an exact
in-code comparison, so the result is exact even though the query is not, and no
tenant catalogue is ever truncated by a row limit.

---

## 7. Validation framework — IMPLEMENTED NOW

A validator is a small pure function over a pre-loaded context:

```ts
type OrderValidator = { id: string; category: IssueCategory; run(ctx: ValidationContext): ValidationIssue[] };
type ValidationIssue = { code; severity: "error" | "warning" | "info"; category; message; lineNo?; data? };
```

The loader resolves the customer, matches products and reads prices, stock,
reservations and BOM presence once; validators never touch the database, which
makes each one unit-testable and makes adding a validator a one-file change.
`error` blocks approval, `warning` must be acknowledged, `info` is shown.

| Category | Implemented checks | Designed for later |
|---|---|---|
| Customer | exists in tenant, active, not on hold (warning), ambiguous, matched-by-email (warning) | account status from Xero |
| Product | matched / unmatched / ambiguous, name-match review, duplicate product lines | external-id rung |
| Quantity | positive and finite | MOQ, case-quantity (pack sizes exist but order unit semantics are not confirmed) |
| Price | resolves the customer price (`resolveCustomerProductPrice`: contract → default list → product master); missing price (blocking); supplied vs expected mismatch (warning) | tolerance per customer |
| Stock | on hand **net of existing `Reserved` sales-order allocations**; shortage (warning) | location-level availability |
| Production | shortfall with a BOM → production requirement (info); shortfall without a BOM (warning) | capacity and lead time |
| Margin | expected cost from the product master, expected GP and GP%; negative margin (warning); missing cost → **Not Measured** (info), never 0 | tenant GP threshold (the sales-order engine's hard-coded 30% is not copied) |
| Commercial | requested delivery date in the past (warning); same customer + PO already received (warning) | delivery rules, cut-offs |
| Arithmetic | supplied line total and supplied subtotal vs computed (warning) | tax arithmetic once VAT basis per source is known |
| Accounting | — | currency, tax treatment, invoice requirements |

---

## 8. Approval workflow — IMPLEMENTED NOW

The review screen shows customer and match rule, PO and external references,
every line with raw vs matched product, quantity, supplied vs expected price,
available stock, production implication and expected margin, all issues grouped
by severity, the audit trail, and the downstream handoff.

Approve / reject / hold / release / request changes are server actions gated by
`sales_orders.approve`; buttons are also hidden client-side but the server is the
authority. Each decision writes an event with the actor from the verified session.

On approval the handoff calls the existing `saveCustomerSalesOrder` with a
pre-allocated sales-order id (a backwards-compatible optional parameter), the
**approved unit prices passed explicitly**, and the workspace VAT rate from
`resolveDefaultVatRate`. The sales order is created as `Draft`. The handoff
card on the intake then shows the sales order's live status and links to it.
**Nothing is reserved, posted, invoiced, e-mailed or sent to Xero.**

---

## 9. Documents, PDF, Excel — DESIGNED FOR LATER (except CSV)

Reuse, do not rebuild: the private `vyron-documents` bucket and path helper,
the `vyron_documents` row pattern (new `document_type: "customer_order"`),
sha-256 duplicate detection, `assessDocumentForVision`, and the
schema-validated OpenAI Responses pattern in
`document-intelligence-v2/supplier-invoice-extractor.ts`. Needed first: the
bucket's MIME allow-list extended for xlsx/csv, and a customer-order extraction
schema. The existing supplier-invoice prompt/schema is not suitable.

## 10. AI — DESIGNED FOR LATER (extraction contract IMPLEMENTED)

> Revision 2: the extraction contract (per-field value, confidence, source
> location, method) and its validator are implemented and tested; no provider is
> called. See `ORDER_SOURCE_ADAPTERS.md` §6.

An `OrderExtractionProvider` produces an `OrderCandidate` exactly like an
adapter. Rules fixed now:

- AI output is **always** `REVIEW_REQUIRED` at line level unless a deterministic
  rung independently matches the same product; AI never sets `MATCHED`.
- AI never sets a price, a customer or a status; deterministic validation stays
  authoritative.
- Metered through `AiUsageService` (a new `AiFeatureId` member), availability via
  `classifyAiProviderFailure`, quality measured against labelled orders — not
  model self-reported confidence (the extraction-quality standard).

## 11. Inbound e-mail, platforms, API/EDI

**E-mail — boundary IMPLEMENTED, ingestion DESIGNED FOR LATER.**
`receiveInboundEmail(company, message)` stores the envelope idempotently
(unique message id), then uses the attachment/tabular adapter if a CSV
attachment is present, otherwise records `NO_ORDER_FOUND` for manual handling.
No provider is connected: the repository has no inbound mail anywhere (Resend is
outbound only). A later provider webhook (e.g. Resend/Postmark inbound) must
verify the provider signature, resolve the company from the receiving address
(never from the payload), and store attachments in `vyron-documents`.

**WooCommerce / Shopify — normalisers IMPLEMENTED, connection DESIGNED FOR LATER.**

| External | VYRON |
|---|---|
| order id | `source_key` (idempotency) — with the store identifier once multi-store is configured |
| order number / name | `external_order_number` |
| line id | `source_line_reference` |
| line sku / name / quantity / price | raw line fields (matching as §6) |
| customer id / e-mail | `customer_reference` (never auto-creates a customer) |
| status | `source_status`; `cancelled`, `refunded`, `failed`, `trash` (Woo) or cancelled/voided (Shopify) are **refused** at intake |
| currency, totals, tax | `currency`, `supplied_*` (VAT basis not assumed) |

Connection needs: per-tenant encrypted credentials, a signed webhook receiver,
and a store dimension. Historical backfill never flows through here.

**API / EDI — DESIGNED FOR LATER.** A tenant API key + `Idempotency-Key` header
maps onto the same `receive` service.

## 12. Idempotency and provenance — IMPLEMENTED NOW

- Source identity: **`(company_id, source, source_key)`**, a unique constraint.
  Manual entries may omit a key; every other adapter must supply one.
- Re-receiving the same key with the same `content_hash` returns the existing
  intake (`duplicate: true`) and writes a `RECEIVE_DUPLICATE` event. The same key
  with **different** content is refused (`409`) — a changed external order is
  never silently overwritten.
- A concurrent insert that loses the race on the unique constraint re-reads the
  winner.
- Line identity: `(intake_id, source_line_reference)` unique when present; a
  candidate with a repeated line reference is rejected as malformed.
- Handoff identity: `pending_sales_order_id` is claimed by compare-and-set before
  the sales order is written, so a retried or concurrent confirm finds and links
  the same sales order instead of creating a second one. `sales_order_id` is
  unique.
- E-mail: `(company_id, channel, message_id)` unique.

## 13. Tenant isolation and security — IMPLEMENTED NOW

- Every table carries `company_id`; every query filters on it; child rows are
  also filtered by company, not just by parent id.
- RLS enabled with **no policies** on all four tables: only the server's
  service role can reach them (the convention of every table since 2026-08-24).
  The Order Engine is never touched by the browser Supabase client.
- Every API route: `requireWorkspacePermission(...)` (authentication +
  permission) then `requireApiCompanyId()` (company from the verified session;
  a conflicting cookie hint is refused). The company is never read from the
  request. Pages use `requireWorkspacePage("sales_orders.view")`.
- An id from another tenant returns `404`, not `403`, so existence is not leaked.
- No company id, user or Food Sock identifier appears in the Order Engine code.
- The audit actor is the verified session's user id, never `body.actor` (the
  existing sales-order routes still accept a client actor — noted in §15).

## 14. Error handling

Service functions throw a typed `OrderEngineError { code, status }`
(`NOT_FOUND 404`, `INVALID_TRANSITION 409`, `CONFLICT 409`,
`VALIDATION_REQUIRED 409`, `WARNINGS_NOT_ACKNOWLEDGED 409`,
`INVALID_INPUT 400`, `HANDOFF_FAILED 502`). Routes map them to JSON
`{ ok:false, code, error }`; workspace access errors keep their existing
mapping; a missing table (migration not applied) returns `503` with a clear
message instead of a crash.

## 15. Known limitations and findings

Found while tracing the existing engine. Items 1–3 and 6–7 were **fixed on
2026-09-22** with regression tests (`test:sales-order-safety`); details and the
remaining open items are in `SALES_ORDER_INTEGRATION.md` §4 and
`SECURITY_REVIEW.md` §3.

1. ~~Price lists applied only when the master price was 0~~ — fixed: the master
   price is the last fallback; contract beats default deterministically.
2. ~~Reservation ignored other orders' reservations~~ — fixed: live
   reservations are netted (shared rule with the Order Engine).
3. ~~Sales-order and invoice routes took the audit actor from the request~~ —
   fixed on the order and invoice path; 26 other routes recorded as open (O1).
4. `sales_orders.approve` has no separation of duties — open (O4).
5. `buildIngredientShortageLines` does not scale by BOM yield or wastage — open.
6. ~~Staff order entry priced lines at cost~~ — fixed.
7. ~~Any member could set a customer's portal PIN~~ — fixed.
8. `/order-centre` has no `NAV_PATH_PERMISSIONS` entry — open (display only;
   its APIs are server-gated).

## 16. Food Sock

Only confirmed facts are used; nothing Food Sock-specific is in the engine.
See `FOOD_SOCK_READINESS.md` for what is known, what VYRON can already
support, and the questions that must be answered first. Food Sock historical
sales remain in the separate external-sales design and never become intakes or
invoices.

## 17. What is required before production

1. Review and apply **both** migrations —
   `20260922120000_vyron_order_intake.sql` then
   `20260922130000_vyron_order_intake_hardening.sql` — to the production
   database: **a human-approved production DDL change**, through the safety
   programme.
2. Merge the branch to `main` (which auto-deploys). The branch also contains
   the existing-engine fixes (§15), which take effect on deploy whether or not
   the migrations are applied. Until the migrations are applied the Order Inbox
   answers "not yet enabled" rather than failing.
3. Decide whether Order Engine events should reach the existing staff
   notifications — deliberately off.
4. For a live-screen demo: an approved non-production environment
   (`DEMO_SCRIPT.md` §5).

## 18. Implementation map (handover)

| Concern | File |
|---|---|
| Types | `src/lib/order-engine/types.ts` |
| State machine, permissions per action, derived statuses | `lifecycle.ts` |
| Deterministic matching (customer, product, aliases, identities) | `matching.ts` |
| Validators, context loader | `validation.ts` |
| Issue catalogue (meaning, level, action) | `issue-catalog.ts` |
| Receive, edit, actions, handoff, mappings, Exception Centre, audit, CAS | `service.ts` |
| Customer order policies | `policies.ts` |
| Order sources and states | `sources.ts`, `adapters/{manual,csv,email,platforms,types}.ts`, `email-intake.ts` |
| Cost redaction | `redaction.ts` |
| Notifications (off by default), telemetry | `notifications.ts`, `telemetry.ts` |
| Route plumbing (auth → permission → company, actor, JSON / size) | `http.ts` |
| Demo fixtures (fictional) | `demo/fixtures.ts` |
| API | `src/app/api/order-intake/` — list/receive, `[id]`, `lookup`, `exceptions`, `mappings`, `policies`, `sources` |
| UI | `src/app/order-inbox/` (inbox, new, `[id]`, exceptions, rules), `src/components/vyron-order-engine/*` |
| Shared with the sales-order engine | `src/lib/vyron-sales-order-reservations.ts`, `src/lib/vyron-audit-actor.ts` |
| Migrations | `supabase/migrations/20260922120000_vyron_order_intake.sql`, `20260922130000_vyron_order_intake_hardening.sql` |
| Scripted demo | `scripts/order-engine-demo.mjs` |

Companion documents: `SALES_ORDER_INTEGRATION.md`, `APPROVAL_MODEL.md`,
`VALIDATION_RULES.md`, `ORDER_SOURCE_ADAPTERS.md`, `SECURITY_REVIEW.md`,
`DEMO_SCRIPT.md`, `FOOD_SOCK_READINESS.md`.

## 19. Verification

| Suite | Kind | Checks |
|---|---|---|
| `test:order-engine` | domain + real sales-order handoff | 171 |
| `test:order-engine-routes` | API security & workflow, real session code | 42 |
| `test:order-engine-permissions` | 10 roles × 19 endpoints + anonymous, 415/413, tenant isolation | 226 |
| `test:order-engine-fixtures` | 20 fictional scenarios through their real adapters, approved into Draft sales orders | 214 |
| `test:order-engine-concurrency` | 16 race / retry / duplicate scenarios | 45 |
| `test:order-engine-controls` | mappings, identities, policies, notifications, telemetry, redaction, Exception Centre, filters, CSV hardening, WooCommerce / Shopify review, AI contract | 126 |
| `test:sales-order-safety` | existing-engine fixes through real routes | 32 |
| `test:order-engine-migration-pg` | both migrations on a disposable local Postgres, two-connection races, EXPLAIN on 50 000 rows | 64 |
| Existing offline suites | regression | all pass (see the final report) |
| Browser harness | the real screen components, bundled, fed responses from the real routes on the fictional tenant, production CSS, Chromium | 12 screens, 0 errors; screenshots in `screenshots/` |

The browser harness is a one-off verification kept outside the repository (it
needs a bundler the repository does not ship); the full app was not run against
a database, because the only configured database is production.

## 20. The demo workflow

See `DEMO_SCRIPT.md` — scripted end-to-end demo (`npm run demo:order-engine`)
and the screen walkthrough.
