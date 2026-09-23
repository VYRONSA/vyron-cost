# Customer Ordering vs stock and price lists — read-only audit

Raised by Kingdom Foods: *the Customer Ordering Application does not tie up with
actual stock on hand / stock available; customers must only see stock and prices
applicable to their own price list; all stock adjustments must synchronise.*

This audit was done by reading the code and schema, and by reproducing the
behaviour on a fictional tenant in memory
(`npm run test:customer-ordering-stock`). **No Kingdom Foods production data was
read or written.** No production query was run, no migration applied, no order,
price or stock quantity changed anywhere.

**Sections 1–12 describe the system as it was found.** Section 13 records what
was changed afterwards, and section 15 what still needs a person.

---

## 1. The authoritative stock flow

```
  a movement happens (adjustment, GRN receipt, production, sale, reversal…)
        │
        ▼
  postStockMovement()                         src/lib/vyron-inventory.ts:243
        ├── INSERT vyron_cost_stock_ledger    (immutable: quantity_in/out, balance_after)
        └── UPDATE vyron_cost_stock_items     (qty_on_hand, average_cost, inventory_value, stock_status)
        │
        ▼
  vyron_cost_stock_items.qty_on_hand          ← STOCK ON HAND (the only balance)
        │
        │   minus
        ▼
  loadReservedQuantities()                    src/lib/vyron-sales-order-reservations.ts
        └── vyron_customer_sales_order_allocations (status='Reserved')
            filtered to orders whose status is
            Approved | Picking | Packed | Dispatched | Partially Invoiced
        │
        ▼
  AVAILABLE TO SELL = qty_on_hand − reserved by other live orders
        │
        ├──► staff Sales Order approval   checkAndReserveStock()   vyron-customer-sales-orders.ts:1115
        ├──► Order Engine validation      loadStock()              order-engine/validation.ts:944
        │
        └──►  ✗  NOTHING.  The Customer Ordering Application is not connected to it.
```

The customer-facing path, in full:

```
  /order/<tenant>  →  GET /api/vyron-order/catalogue  →  getCustomerCatalogue()
                                                         src/lib/vyron-order-catalogue.ts
      returns per product:
        productId, productName, category, sku,
        sellingPrice, priceSource, priceUnavailable,
        unitsPerBox, pricePerBox
      ── no stock quantity, no availability, no lead time ──

  cart  →  POST /api/vyron-order/orders  →  submitCart()   src/lib/vyron-order-cart.ts
      server checks: idempotency, cart not empty, price still the one shown,
                     delivery date sane
      ── no availability check of any kind ──
        │
        ▼
  saveCustomerSalesOrder()  →  vyron_customer_sales_orders (status "Draft")
      ── a Draft reserves nothing, so it does not reduce availability either ──
```

**Stock on hand and stock available are not the same thing here, and the customer
application has neither.**

## 2. The source of truth

| Question | Answer | Where |
|---|---|---|
| Stock on hand | `vyron_cost_stock_items.qty_on_hand`, one row per (company, entity_type, entity_id), maintained incrementally | `src/lib/vyron-inventory.ts` |
| The movement history | `vyron_cost_stock_ledger` (`balance_after` per movement) | same |
| Stock available to sell | `qty_on_hand − loadReservedQuantities()` — there is no stored "available" column anywhere | `src/lib/vyron-sales-order-reservations.ts` + its two callers |
| Reservations | `vyron_customer_sales_order_allocations`, `status='Reserved'`, counted only while the parent order is live | same |

There is **no materialised view, no stock summary table and no cache**. Every
stock figure in the product is computed per request. `qty_on_hand` is itself a
denormalised running balance, never recomputed from the ledger.

Two legacy balances still exist and are worth knowing about, though neither is
involved in the Kingdom Foods symptom: `vyron_finished_goods.current_stock`
(written by customer-invoice posting) and `vyron_stock_movements` (a second
movement log). Customer-invoice availability adds the legacy bucket to the
canonical one, so it can read higher than the Stock Master.

## 3. What the customer-facing API actually returns

Per product: product id, name, category, SKU, **the customer's own price**,
which list it came from, whether a price exists at all, units per box and the
box price. Cost, BOM cost, supplier price, margin and GP are deliberately absent
— and are genuinely absent, not merely unused.

What it cannot expose (verified): another customer's price, another customer's
reservation, another tenant's products, product cost. The tenant gate is the
session: `resolveCustomerSession` puts `companyId` and `customerId` on the
request, and neither can be supplied by the caller.

What it does **not** return: stock on hand, available quantity, availability
status. The only signal a customer sees is `priceUnavailable`, which means
*no price*, not *no stock*.

## 4. Price-list resolution

```
  customer session → vyron_customer_price_list_assignments (status Active)
                   → contract_price_list_id, then default_price_list_id
                   → vyron_customer_price_list_items (status Active, effective on the date)
                   → else vyron_cost_products.selling_price      ← the master price
```

Implemented twice, deliberately: `resolveCustomerProductPrice` for one product
(staff Sales Orders, invoices, Order Engine) and a batched copy inside
`getCustomerCatalogue` for a whole catalogue. They agree, and a test asserts
they agree product by product.

**The finding:** when a customer *has* an assigned price list but the product is
not on it, both implementations fall back to the product master price, and the
customer can order at it. That is the rule Kingdom Foods is disputing. It is not
a bug in the sense of a mistake — it is a deliberate rule, documented and pinned
by `scripts/test-sales-order-safety.mjs` — but it is the wrong rule for a
customer whose price list is meant to be exhaustive.

Two smaller findings in the same path:

- Neither implementation checks the price **list's** own `status` or effective
  dates — only the assignment's status and the item's. An inactive or expired
  list still prices.
- Only the Order Engine passes `asOfDate`. Sales orders and invoices price as of
  today rather than the order/invoice date.

## 5. Stock available: the exact rule today

`available = qty_on_hand − Σ reserved_qty` over `Reserved` allocations of orders
in Approved, Picking, Packed, Dispatched or Partially Invoiced.

- **Sales orders** reserve on approval, not on creation. A Draft or Awaiting
  Approval order holds nothing.
- **Cancelled orders**: their allocation rows are never deleted; they stop
  counting because the status filter excludes them. The rows are orphaned but
  harmless to this calculation.
- **Completed orders**: on full invoicing the allocations become `Converted`;
  stock physically leaves on invoice posting.
- **Production, purchases, adjustments, reversals** all change `qty_on_hand`,
  so they change availability immediately — for the staff paths that ask.
- **The staff UI's "Avail" column** uses `buildPickingList`, which is **gross**
  `qty_on_hand` and does not subtract reservations, while approval uses the net
  figure. The screen can therefore show more than approval will allow.

## 6. Stock adjustments, and whether the customer app follows

Every mechanism funnels through `postStockMovement`, so every one of them
updates `qty_on_hand` immediately:

manual adjustment and transfer · stock counts · GRN receipt and reversal · PO
direct receipt · production consumption and receipt · manufacturing reversal
(an RPC that locks the run) · store dispatch · customer-invoice posting and
reversal · opening balances and imports.

**Does the Customer Ordering Application reflect the result? No — for all of
them.** Not because synchronisation is slow or cached, but because there is no
connection at all. This is one gap, not twelve.

## 7. Real-time / stale data

Ruled out by reading the code:

| Suspected cause | Verdict |
|---|---|
| Cached API response | **No.** Every `/api/vyron-order/*` route is `runtime = "nodejs"` with no `revalidate`; no `unstable_cache`; no ISR |
| Browser cache | **No.** Every client fetch uses `cache: "no-store"` |
| Stale server data | **No.** Every page in the feature is `dynamic = "force-dynamic"` |
| A separate stock table | **No.** None exists |
| Missing revalidation | **No.** Nothing to revalidate |
| Asynchronous sync queue | **No.** There is no queue between stock and ordering |
| Wrong company / customer / price list | **No.** Scope comes from the session; proven in the reproduction |
| Cancelled-order reservation not released | **No.** Rows persist but are filtered out correctly |
| Incorrect reservation calculation | **Partly** — the staff UI's "Avail" is gross; and two orders can double-reserve (§10) |
| Stock adjustment not propagated | **Yes, in effect** — nothing propagates to the customer app because nothing connects them |

## 8. The Customer Ordering Application, screen by screen

| Step | What the server enforces |
|---|---|
| Product listing | tenant + customer from the session; price from their list; **no availability** |
| Product detail / quantity | any quantity ≥ 1; step is the case size where a pack size exists |
| Cart | product re-validated against the customer's own catalogue; price re-resolved on every read |
| Checkout | delivery date sane; price must match what was shown |
| Submission | idempotency claimed before the write; price re-checked to the cent; **availability never checked** |
| Confirmation | the order as written |

A customer can order any quantity of anything, including a product with zero on
hand. The shortage is discovered later, when staff try to approve the order.

## 9. Price snapshot

Correct. The agreed price is written to
`vyron_customer_sales_order_lines.selling_price` when the order is created, and
every downstream step (approval, invoice conversion) reads that snapshot rather
than re-resolving. A later price-list change does not alter an existing order.
Proved in the reproduction.

## 10. Race conditions — two, both proven

**(a) Double reservation.** `checkAndReserveStock` reads availability, checks it,
then writes allocations, with no lock and no constraint. Two approvals of 7 and
5 against 10 on hand both succeeded and reserved **12 of 10**.

**(b) Lost stock movement.** `postStockMovement` reads `qty_on_hand`, computes a
new balance in JavaScript, and writes it back. Two simultaneous movements of 10
off 100 left **90, not 80** — one movement was silently lost, while both ledger
rows were written.

Neither is caused by the Customer Ordering Application, and neither can be fixed
there. (b) is the more serious of the two: it can corrupt the authoritative
balance itself.

## 11. Reproduction

`npm run test:customer-ordering-stock` — fictional tenant, in memory. It
reproduces, against the real application code:

- stock on hand 10, 4 held by a live order, 6 available;
- the customer catalogue carrying no stock field at all;
- a customer ordering 56 of a product with 6 available, successfully;
- a customer ordering 25 of a product with 0 on hand, successfully;
- the shortage surfacing only when staff approve;
- an adjustment taking soup from 100 to 5 with the customer's catalogue
  unchanged, and a customer then ordering 50;
- the two races above.

It also confirms the parts that are correct: price isolation between customers,
price snapshotting, and tenant isolation.

## 12. Where the mismatch occurs

**Between `getCustomerCatalogue` / `submitCart` and the availability calculation
that already exists.** There is no defect in the stock engine's arithmetic, no
cache, no stale copy and no tenant confusion. The customer application was built
without a stock dimension, so nothing about stock — correct or otherwise — ever
reaches the customer, and nothing stops them ordering what the business does not
have.

## 13. Exact changes required

| # | Change | Where | State |
|---|---|---|---|
| 1 | The customer catalogue now carries availability, taken from the one calculation staff approval enforces (`loadAvailableQuantities`). On hand is not sent to a customer; what they may order is | `vyron-sales-order-reservations.ts`, `vyron-order-catalogue.ts` | **done** |
| 2 | Availability is enforced server-side at submission, and again immediately before the write, with the quantities that are actually free returned to the customer | `vyron-order-cart.ts`, `/api/vyron-order/orders` | **done** |
| 3 | A placed customer order holds the stock it commits, through the sales-order engine's own reservation. A customer that loses a race has its order cancelled and is told what is left | `vyron-order-cart.ts`, `reserveStockForSalesOrder` | **done** |
| 4 | `postStockMovement` is now compare-and-set with a bounded retry: the balance is written only if it has not moved since it was read, and the ledger row is written after it, so a lost race writes nothing | `vyron-inventory.ts` | **done**, no migration |
| 5 | Reservation settles contention deterministically: after writing, the whole position is re-read and stock is handed out earliest-first, so exactly one of two racing orders keeps it | `checkAndReserveStock` | **done**, no migration |
| 6 | The price-list rule is now configuration per customer — `fallback_to_master` (unchanged for every existing customer) or `assigned_list_only`, under which an uncovered product is unavailable rather than priced from the master. The staff flow refuses it too, unless a person enters a price deliberately | migration `20260925120000`, both resolvers, `vyron-customer-sales-orders.ts` | **done**, migration not applied |
| 7 | Show the net figure on the staff "Avail" column, or label it gross | `buildPickingList` | open |
| 8 | Consider checking the price list's own status and effective dates, and passing `asOfDate` from sales orders and invoices | both resolvers | open |

Items 7 and 8 are left alone deliberately: neither causes the Kingdom Foods
symptom, and item 7 changes a number staff read every day, so it deserves its
own decision.

The migration in item 6 is additive and defaults to today's behaviour, so
applying it changes nothing until a customer is configured. It still requires
the controlled production process.

## 14. What the fix does not do

- It does not dispatch, invoice or move stock. A customer's order still creates
  a Draft sales order; staff still approve it.
- It does not change any existing customer's prices. The price-list rule
  defaults to exactly what happens today.
- It does not touch the Food Sock Order Engine work. The one shared change is
  that a reservation now holds from the moment an order is placed, which the
  Order Engine reads through the same function it already used.
- It does not attempt the two open items above.

## 15. What would need production access, and why

Nothing in this audit required it. Before any correction to Kingdom Foods' own
data, a **read-only** inspection would be needed to answer:

1. How many `Reserved` allocation rows belong to orders that are Cancelled or
   Draft (orphans — harmless to the calculation, but they should be quantified).
2. Whether `vyron_cost_stock_items.qty_on_hand` agrees with the last
   `balance_after` in `vyron_cost_stock_ledger` per item — the direct test for
   whether the lost-update race has already cost real quantity.
3. Whether any Kingdom Foods customer has an assigned price list that does not
   cover every product they can currently see.
4. Whether `vyron_finished_goods.current_stock` disagrees with the Stock Master
   for any finished good.

Each is a single read-only query. They must be approved before being run, and
nothing should be corrected until the results are in.
