# Food Sock ordering — production readiness

Where the ordering pipeline stands, what is waiting on Food Sock, and what
engineering work remains. Nothing in this document has been applied to, read
from or written to Food Sock production.

Legend: **Done** — built and proved by tests · **Waiting** — needs a business
answer · **Engineering** — needs work that cannot be finished without the
answer or a provider.

## 1. Done

| Item | Status | Proved by | Safety requirement kept |
|---|---|---|---|
| Canonical intake (manual, CSV, Excel, e-mail, document extraction, web store) | Done | `test:order-engine-food-sock`, `test:order-engine-fixtures` | One shape for every channel; no per-source business logic |
| Frozen source facts | Done | suite + database trigger (`test:order-engine-migration-pg`) | What the customer sent is never overwritten; changes are raised to the approver |
| Deterministic matching (external id → SKU → alias → exact name) | Done | suite | No fuzzy matching; ambiguity is an exception |
| Validation (customer, product, quantity, price, stock, production, margin, delivery, duplicates, tax, extraction) | Done | suite | Every failure is an explicit exception |
| Production requirement with BOM components | Done | suite | Estimate only: nothing is produced, reserved or purchased |
| Exception Centre (values, who raised it, resolutions, documents) | Done | suite | Nothing is processed silently |
| Human approval with live re-validation | Done | suite | Approval cannot use a stale validation |
| Sales Order handoff (idempotent, linked, priced, VAT) | Done | suite (incl. concurrency and retry) | No invoice, no Xero, no reservation, no second order |
| B2B / B2C context and channel | Done | suite | Web orders from unknown customers stop until a B2C account is chosen |
| Tenant isolation (orders, customers, products, pricing, exceptions, settings, mailboxes, channels, source links) | Done | suite + `test:order-engine-permissions` (25 endpoints × 10 roles + anonymous) + `test:server-page-tenant-security` | A tenant can only ever see its own data |
| Provenance (source message, attachment hashes, extraction attempts, audit trail) | Done | suite + PG test | Every transition records tenant, order, actor, time, from/to state and reason |
| Tenant configuration model (D1–D12) with "not decided" as a first-class state | Done | suite (decision register) | A missing decision never becomes a business rule |
| E-mail acceptance policy (sender, attachment type and size, duplicates, provider verification) | Done | suite | Unexpected mail is quarantined, never processed into an order |
| UAT (14 scenarios, fictional; catalogue snapshot supported) | Done | `test:order-engine-food-sock`, `npm run uat:food-sock` | Fictional orders only; never written to Food Sock production |

## 2. Waiting for Food Sock

Each is a tenant setting today; the engine's behaviour until it is answered is
in `FOOD_SOCK_OPEN_DECISIONS.md` and on the Order rules screen.

| Ref | Decision | Dependency | Activation requirement | Blocks orders? |
|---|---|---|---|---|
| D1 | Web orders: fulfil in VOLORA or history only | Food Sock | Set "Web-store orders" in Order rules | Yes — web orders are held |
| D2 | How B2C web orders are booked | Food Sock | Choose the B2C account | Yes — unknown web customers stop |
| D3 | Store prices include VAT (per store) | Food Sock / store config | Set the channel's VAT basis | No — stated per order, else warned |
| D4 | How shipping is billed | Food Sock | Set shipping treatment | No — warned, never carried |
| D5 | Retailer rules (PO, delivery days, minimum order, cases, margin) — SPAR, PnP, others | Food Sock | Add a customer rule per retailer | Per rule |
| D6 | Repeated PO: warn or block | Food Sock | Setting (safe default: warn) | No |
| D7 | Name matching for SKU-less lines | Food Sock | Setting (safe default: review) | No |
| D8 | Minimum lead time | Food Sock | Setting | No |
| D9 | Store/retailer SKUs vs VOLORA SKUs | Food Sock | Setting + mappings or source links | No — unmatched lines stop |
| D10 | Which store statuses mean ready to fulfil | Food Sock | Channel eligible statuses | No — unexpected statuses stop |
| D11 | Who approves; may the creator approve | Food Sock | Setting + workspace roles | No |
| D12 | Receiving mailbox and PDF extractor | Food Sock + provider | Mailbox row + provider connector | Yes — no mail is received; PDFs are held |

## 3. Engineering still required

| Item | Status | Dependency | Activation requirement | Safety requirement |
|---|---|---|---|---|
| Mailbox connector activation | Engineering | D12, a mail provider | A provider webhook that verifies the provider's own signature, then calls `receiveConnectorMessage`; the tenant comes from the receiving address only | Never resolve the tenant from message content; quarantine anything outside the mailbox policy |
| PDF extractor activation | Engineering | D12, a provider | Register a provider implementing `PdfExtractor` and set it in Order rules | Extracted values stay candidates: confidence per field, LOW blocks approval, the original document and hash are kept |
| Web-store connector (if D1 = fulfil) | Engineering | D1, store credentials | A store connector that calls the existing adapters; channel row enabled | Historical orders stay refused; only eligible statuses are fulfilled |
| Production migrations | Engineering | schema review sign-off | Apply the four migrations through the Family P safety process | Reviewed in `MIGRATION_REVIEW.md`; no destructive step; rollback documented |
| Production UAT | Engineering | migrations applied to a non-production copy | Export a catalogue snapshot from that copy and run `npm run uat:food-sock -- --catalogue <file>` | Fictional orders only; never against production |
| Production activation | Engineering | everything above | Merge the branch (auto-deploys), apply migrations, configure decisions, enable one channel at a time | Approval stays human; nothing invoices or posts to Xero automatically |

## 4. What production activation does NOT include

- No automatic invoicing, e-mailing or Xero posting on approval.
- No automatic production or stock reservation: approving an order creates a
  Draft sales order, and the existing sales-order, manufacturing and invoicing
  workflows continue to own those steps.
- No conversion of historical Metorik / WooCommerce sales into sales orders or
  invoices.
