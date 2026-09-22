# Order Engine ↔ Sales Order Engine — Integration

The canonical record of how the Order Engine (intake, matching, validation,
approval) hands orders to the **existing** VYRON Sales Order engine, what that
engine then does, and where the boundary is. Traced from code on 2026-09-22;
file references are to `src/`.

**Principle: there is one sales-order engine.** The Order Engine creates Draft
sales orders through the existing `saveCustomerSalesOrder` and never
reproduces picking, reservation, invoicing or Xero.

```
Order Engine (intake)                 Existing Sales Order engine (system of record)
────────────────────                  ─────────────────────────────────────────────
receive → match → validate → approve ─▶ saveCustomerSalesOrder (Draft)
                                         ├─ submit → approval rules → Approved (reserve stock)
                                         ├─ approve → reserve stock
                                         ├─ start_picking → pack → dispatch  (status only)
                                         ├─ convertSalesOrderToInvoice → invoice (Draft)
                                         │    └─ Customer Invoices: post → stock ledger + Xero queue
                                         └─ cancel
```

## 1. The existing workflow, end to end

### 1.1 Entry points that create sales orders

| Creator | Code | Price | Cost | Audit actor | Notifies |
|---|---|---|---|---|---|
| Staff screen (Sales Orders) | `app/api/customer-sales-orders/route.ts` POST → `saveCustomerSalesOrder` | line price as sent; if blank → customer price list → product master (**fixed 2026-09-22**, see §4) | product master `total_cost` (browser cost ignored) | verified member (**fixed 2026-09-22**) | no |
| VYRON ORDER customer portal | `lib/vyron-order-cart.ts` → `saveCustomerSalesOrder` | resolved customer price, acknowledged by the customer | product master | `"user"` (portal customers are not workspace members) | `notifyOrderEvent("new_order")` |
| **Order Engine** (new) | `lib/order-engine/service.ts` `handOff` → `saveCustomerSalesOrder` | the approved line price, passed explicitly | product master | verified approver | no (off by default — §6) |

All three produce a **Draft** sales order. None reserves stock, posts, invoices
or queues Xero.

### 1.2 Tables

| Table | Holds | Written by |
|---|---|---|
| `vyron_customer_sales_orders` | header, status, totals, cost/GP snapshot, `approved_by` | `saveCustomerSalesOrder`, `transitionCustomerSalesOrder`, `convertSalesOrderToInvoice` |
| `vyron_customer_sales_order_lines` | lines; `cost_per_unit` is the cost snapshot that becomes invoice cost of sales | same |
| `vyron_customer_sales_order_allocations` | stock reservations (`Reserved` → `Converted`) | `checkAndReserveStock`, conversion |
| `vyron_customer_sales_order_audit` | the order's audit trail | every action |
| `…_invoice_links`, `…_production_links`, `…_requisition_links` | traceability | conversion, production run, requisition |
| `vyron_order_intakes` (new) | links **back**: `sales_order_id` (unique) | Order Engine handoff |

### 1.3 Status transitions (existing, unchanged)

`Draft → Awaiting Approval → Approved → Picking → Packed → Dispatched →
(Partially) Invoiced`, and `Cancelled` from any open state
(`lib/vyron-customer-sales-orders.ts` `TRANSITIONS`).

| Action | Permission | Side effects |
|---|---|---|
| submit | `sales_orders.create` | evaluates the engine's approval rules (GP < 30 %, discount > 15 %, customer on hold, credit limit). None → **Approved and stock reserved**; otherwise Awaiting Approval |
| approve | `sales_orders.approve` | **reserves stock** (refuses on shortage, 409); sets `approved_by` |
| start_picking / pack | `sales_orders.pick` | status + timestamp only |
| dispatch | `sales_orders.dispatch` | status + timestamp only — **no stock movement** |
| cancel | `sales_orders.edit` | status only — **reservation rows are not released** (now ignored, §4) |
| convert to invoice | `sales_orders.convert` | only from Dispatched / Partially Invoiced; creates a **Draft** invoice with the order's cost snapshot; marks all remaining quantity invoiced (so "Partially Invoiced" is not reachable through this path) |

The Order Centre (`/order-centre`) is a read model over these statuses and
moves orders only through `transitionCustomerSalesOrder`; its approve is
offered from Draft, so an order can be approved without `submit`'s rule check.
That is existing behaviour, unchanged; for Order-Engine orders the commercial
check has already happened at intake.

### 1.4 Stock and reservations

- **Available** for a finished product = `vyron_cost_stock_items.qty_on_hand`
  (`entity_type = 'finished_goods'`) **minus** `Reserved` allocations held by
  **live** sales orders (Approved, Picking, Packed, Dispatched, Partially
  Invoiced) — `lib/vyron-sales-order-reservations.ts`, shared by the Order
  Engine's stock check and the engine's `checkAndReserveStock`.
- Stock physically leaves only when an **invoice is posted**
  (`postCustomerInvoiceStock`: stock movement, stock ledger "Customer Sale",
  inventory audit). Dispatch does not move stock.

### 1.5 Invoice and Xero

- `convertSalesOrderToInvoice` → `createCustomerInvoice`: inserts a **Draft**
  invoice and lines. It does not post stock, queue Xero, or e-mail.
- Posting is a separate, deliberate action in Customer Invoices
  (`POST /api/customer-invoices/[id]/post` or `/post-stock`, permission
  `invoices.reverse`): posts stock, sets status Posted, updates customer
  sales history, and inserts a `vyron_xero_sync_queue` row (status Ready).
- The Xero queue is processed only on demand (`/api/integrations/xero/sync-queue`,
  `xero.sync`). There is no scheduler.
- E-mailing a document is its own route (`/[id]/email`, `sales_orders.approve`
  or `invoices.email`), audited with the verified member.

### 1.6 Notifications (existing)

`lib/vyron-order-notifications.ts` `notifyOrderEvent` records an in-app row and
e-mails / SMSes / WhatsApps configured recipients by role. Fired by the portal
(new order) and the Order Centre (approve, pick, pack, dispatch, cancel). The
back-office Sales Orders route fires none. The Order Engine does not call it
(§6).

## 2. The handoff contract — IMPLEMENTED, TESTED

On approval (`service.ts` `performIntakeAction("approve")` → `handOff`):

| Sales order field | From the approved order |
|---|---|
| id | **pre-claimed** on the intake (`pending_sales_order_id`) before writing — see §3 |
| customer | the customer identified at validation (`validation.customer.id`) |
| lines | one per order line: matched `product_id`, quantity, `unit` (as received or "each"), **selling price = the approved unit price, passed explicitly**, `discountPct` = line discount ÷ gross × 100, `taxRate` = the workspace default VAT rate (`resolveDefaultVatRate`) |
| cost | the product-master cost at the moment of handoff (engine rule; the browser never supplies cost) |
| requested delivery date, delivery address, contact | as on the order |
| notes | `From order ORD-… · source … · PO … · ext …` plus the order's notes |
| audit | `SALES_ORDER_CREATED` and `CREATED_FROM_ORDER_INTAKE` in the sales-order audit, both with the approver's id; `CONFIRMED` on the order with the sales-order number |

The order links to the sales order (`vyron_order_intakes.sales_order_id`,
unique); the sales order's audit metadata carries the intake id and number.
The Order Inbox shows the sales order's live status as the order's
*fulfilment* and *invoice* status (derived, never copied).

**Gap recorded:** the sales-order table has no PO / customer-reference column;
the PO travels in `notes`. Adding a column is a change to an existing table and
was not made.

Tested: `test:order-engine` (handoff fields, VAT from workspace, audit actors,
nothing posted), `test:order-engine-fixtures` (every approvable fixture:
product, quantity, price, discount, tax, PO, customer carried exactly),
`test:order-engine-routes` (through HTTP).

## 3. Handoff safety — IMPLEMENTED, TESTED

| Risk | Control | Test |
|---|---|---|
| Two approvers at once | compare-and-set on (id, company, status, version); exactly one wins | concurrency §2; pg two-connection race |
| Approval retried (double click, network) | the second attempt finds the order no longer awaiting approval | concurrency §10 |
| Crash after writing the sales order, before linking | the id was claimed first; a retried *confirm* finds that sales order and links it | domain "Handoff is idempotent" |
| Half-written sales order (header, no lines) | never linked; handoff fails with a clear message for manual review | domain |
| Two concurrent retries after a failure | the pre-claimed id collides on the second insert → reported as a conflict, not a failure; one sales order | concurrency §11 |
| Handoff fails (e.g. no workspace VAT rate) | order stays **Approved**, `HANDOFF_FAILED` audited, nothing partial, *Retry* offered | domain; concurrency §11 |
| Approval on stale data | approval re-validates; any change (stock, price, reservation, customer) refuses the approval and stores the fresh validation | concurrency §3–6 |

## 4. Existing-engine defects found and fixed (2026-09-22)

Each is proven by `test:sales-order-safety` through the real routes.

| # | Defect | Impact | Fix | Compatible? |
|---|---|---|---|---|
| 1 | Sales-order and invoice routes stored a **request-body actor** (`body.actor`) as fact: `approved_by`, sales-order audit, production-run and requisition `created_by`, stock-ledger and inventory-audit actor | any member could record another member as the approver / poster | routes derive the actor from the verified session (`lib/vyron-audit-actor.ts`); a body actor is ignored | yes — clients sent the literal `"user"` |
| 2 | The Order Centre recorded the literal "VYRON ORDER CENTRE" as actor | the person who approved/dispatched was never recorded | records the member | yes |
| 3 | Portal access admin route (`/api/vyron-order/admin/access`) checked only for a session | a **view-only member could set any customer's portal PIN**, suspend access, or change the public ordering link | read needs `customers.view`; changes need `customers.edit` | yes for members holding those permissions |
| 4 | A line without a price took the product-master price **before** the customer price list was consulted | customer price lists never applied on that path | master price is now the last fallback | changes the price only for blank-priced lines of customers with a price list — which is what the price-list step existed to do |
| 5 | Contract vs default price list chosen by database row order | contract price not guaranteed | contract first, then latest effective date | yes |
| 6 | Staff order entry filled the **selling price with the item's cost** | staff-entered orders defaulted to 0 % margin (always tripping the GP rule) and ignored price lists | the line picker fetches the customer's resolved price (`/api/customer-price-lists/resolve`) | yes |
| 7 | Approval compared **gross** on-hand stock | two orders could reserve the same units | stock held by other **live** orders is netted; cancelled orders' leftover rows no longer count | stricter: an approval that would double-reserve is now refused (409) |

### Recorded, not changed

| Behaviour | Why left |
|---|---|
| ~20 other API routes (procurement, production, inventory counts, store orders, goods receipts, Xero) still accept a client actor | same class as #1 but outside the order path; each needs its own tested change — listed in `SECURITY_REVIEW.md` |
| Cancel does not release reservation rows | harmless now (#7 ignores them); releasing would be a write-behaviour change |
| Sales-order approve does not re-run the approval rules; Order Centre can approve from Draft | existing workflow choice |
| `convertSalesOrderToInvoice` marks everything invoiced | partial invoicing is not supported by this path |
| `buildIngredientShortageLines` ignores BOM yield and wastage | production-planning accuracy; separate change |
| Invoice status can be set to Posted via PATCH without posting stock | invoice module; separate change |
| Sales-order reservation is read-then-write (two simultaneous approvals of different orders could both pass) | needs a database-level lock (RPC); DESIGNED |

## 5. The boundary — what Order Intake approval does NOT do

Proven on every approvable fixture and in the demo:

| Does not | Evidence |
|---|---|
| reserve stock | allocation count unchanged after approval (`test:order-engine-fixtures`) |
| create or post an invoice | `vyron_customer_invoices` empty |
| move stock | `vyron_cost_stock_ledger`, `vyron_stock_movements` empty |
| queue Xero | `vyron_xero_sync_queue` empty |
| e-mail the customer | no e-mail path is called; notifications off by default |

**The Order Engine stops at: APPROVED → Draft sales order.** The existing
workflow takes over from there.

## 6. Notifications — DESIGNED (off)

The Order Engine emits business events (`ORDER_RECEIVED`, `APPROVAL_REQUIRED`,
`ORDER_EXCEPTION`, `ORDER_ON_HOLD`, `ORDER_APPROVED`, `ORDER_REJECTED`,
`ORDER_CONFIRMED`) through `lib/order-engine/notifications.ts`. The installed
notifier is **disabled**; events go nowhere. A later bridge to
`notifyOrderEvent` (recipients by role, delivery log) needs a per-client
decision on who is told of what — not made. Payloads carry identifiers and
counts only. A failing notifier never breaks an action (tested).

## 7. Integration points summary

| Integration point | Order Engine side | Existing side |
|---|---|---|
| Create | `handOff` | `saveCustomerSalesOrder` (+ optional `newOrderId`, `auditActor`) |
| Price | `resolveCustomerProductPrice` at validation | same function; approved price passed explicitly |
| Stock | `loadReservedQuantities` (shared) | `checkAndReserveStock` (shared rule) |
| Status shown back | `deriveFulfilmentStatus`, `deriveInvoiceStatus` | sales-order `status` |
| Audit | intake events + sales-order audit rows | `writeSalesOrderAudit` |
| Permissions | `sales_orders.*` reused | same keys |
