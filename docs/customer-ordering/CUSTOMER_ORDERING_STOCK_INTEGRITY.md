# Customer Ordering — stock integrity

How VOLORA decides what a customer may order, and what stops two customers
being promised the same units. This is platform behaviour: it applies to every
company, existing and new, with no per-client code anywhere in it.

---

## 1. Where stock lives

| | |
|---|---|
| **Stock on hand** | `vyron_cost_stock_items.qty_on_hand` — one row per (company, entity type, entity id). The only balance. |
| **Movement history** | `vyron_cost_stock_ledger` — one immutable row per movement, carrying `balance_after`. |
| **Reservations** | `vyron_customer_sales_order_allocations`, `status = 'Reserved'`, owned by the sales-order engine. |

There is no stock cache, no materialised view, no summary table and no second
balance. Every figure is computed when it is asked for.

## 2. Available to sell

```
available = qty_on_hand − Σ reserved_qty held by live sales orders
```

One function: `loadAvailableQuantities` in
`src/lib/vyron-sales-order-reservations.ts`. Everything that needs to know what
can still be sold reads it from there — the customer catalogue, the cart, and
(through `loadReservedQuantities`) the staff approval and the Order Engine. The
figure a customer is shown and the figure approval enforces are the same
figure, because they are the same code.

A product with **no stock record at all** is reported as `not_measured`, never
as zero. Unknown is not the same as none: a company that does not track
finished-goods stock can still take orders, exactly as before.

The customer is told **what they may order**. They are never told what is in
the building, and never what another customer holds.

## 3. Who owns a reservation

The sales-order engine, and only it. `checkAndReserveStock` writes every
allocation row; nothing else in `src/` writes that table, and a test asserts
it. The customer ordering application reserves by calling
`reserveStockForSalesOrder`, which is the same code path staff approval uses.

## 4. The order lifecycle

```
  customer places an order
        │  price re-resolved, availability re-checked
        ▼
  sales order created (Draft)
        │  reserveStockForSalesOrder — the hold is taken
        ▼
  Awaiting Approval          ← never approved automatically
        │
        ├── a person approves  → Approved → Picking → … (the hold continues)
        ├── a person cancels   → Cancelled (the hold stops counting at once)
        └── nobody decides     → expires, if the company set a policy → Cancelled
```

A customer's order is a request to supply. It is never approved because no
approval rule happened to fire: `transitionCustomerSalesOrder` takes
`neverAutoApprove`, and the customer path always passes it.

Statuses that hold stock: Draft, Awaiting Approval, Approved, Picking, Packed,
Dispatched, Partially Invoiced. The two that hold nothing are **Cancelled** and
**Invoiced** — the first because the order is off, the second because the stock
has physically left and the rows have moved to `Converted`.

## 5. Concurrency

| Race | What protects it |
|---|---|
| Two stock movements at once | `postStockMovement` is compare-and-set: the balance is written only if it is still what was read, with a bounded retry. The balance moves **before** the ledger row, so a lost race writes nothing at all. |
| Two orders for the last units | After writing its allocations, `checkAndReserveStock` re-reads the whole position and settles it earliest-first. Both racing writers see the same rows and reach the same answer, so exactly one keeps the stock; the other withdraws its own rows and is told what is left. |
| Cancellation while another order reserves | A cancelled order stops counting immediately, through the status filter. The worst case is that the second order is refused stock that has just been freed — never that both hold it. |
| Approval while another order reserves | Both go through the same settlement. One wins, one is refused with the quantity that is actually free. |
| A stock adjustment during ordering | The adjustment lands exactly once (compare-and-set) and the next catalogue read reflects it. Orders that succeeded never hold more than what remains. |

All five are exercised in `npm run test:customer-ordering-stock`.

**Known limitation.** These protections are application-level: a re-read and a
conditional write, not a database lock. They close every race that has been
reproduced, and they are safe under PostgREST, where each statement is its own
transaction. A future hardening would move reservation into a single database
function taking `SELECT … FOR UPDATE` on the stock rows. That is recorded as
the next step, not as something already done.

## 6. Price-list policy

```
  assigned price list (contract, then default)
        └── no applicable item?
              ├── fallback_to_master   → vyron_cost_products.selling_price
              └── assigned_list_only   → no price; not orderable
```

Set per customer on `vyron_customer_price_list_assignments.price_source_rule`.
**The default is `fallback_to_master`, which is exactly what the platform did
before**, so no existing customer's pricing changes and nothing has to be
configured for a company to keep working.

Under `assigned_list_only`, a product the customer's list does not cover has no
price, is shown as unavailable, and cannot be ordered — by them, or accidentally
by staff, who are refused unless they enter a price deliberately.

Neither rule modifies a price list. Turning `assigned_list_only` on for a
customer whose list is incomplete will hide products from them; that is the
point of it, and the reason it is off by default.

## 7. Reservation expiry

An unapproved order must not hold stock for ever. How long it may is a business
decision:

| Setting | Meaning |
|---|---|
| `vyron_customer_portal_tenants.pending_hold_minutes` | the company policy |
| `vyron_customer_portal_identities.pending_hold_minutes` | overrides it for one customer |
| `NULL` (both) | **not configured — the hold does not expire** |

There is no default value and no number in the code. Until a company sets one,
nothing expires, which is exactly the previous behaviour; deploying this starts
nothing anywhere.

When a policy is set, `expireStaleCustomerHolds` cancels the expired order
through the ordinary lifecycle, with the same audit trail a person's
cancellation leaves. The stock is released **because a cancelled order is not a
live reservation** — not through a second rule and not by editing quantities.
The sweep runs when a catalogue is loaded, so the release is visible
immediately, and it does nothing at all for a company with no policy.

## 8. Tenant isolation

Company and customer come from the authenticated session
(`resolveCustomerSession`) and can never be supplied by a request. Every read
filters by company. Proved with three fictional companies configured
differently, in one database, in
`npm run test:customer-ordering-multi-tenant`: catalogue stock, prices,
reservations, orders and hold policies are each scoped, and no company's
activity changes another's.

## 9. A new company

Provisioning creates a workspace, customers, products and stock records.
Nothing else is required:

| | |
|---|---|
| Catalogue | works with no configuration rows at all |
| Pricing | product master — backward compatible |
| Availability | correct from the stock record alone |
| Over-ordering | refused |
| Reservation | taken on placement |
| Hold expiry | off until configured |
| Price-list enforcement | `fallback_to_master` until configured |

No manual database edit is needed for basic stock correctness. Asserted in the
multi-tenant suite.

## 10. Every way stock moves

Everything funnels through `postStockMovement`, which writes the ledger row and
the balance together: opening balances and imports · GRN receipt and reversal ·
PO receipt · manual adjustment and transfer · stock counts · production
consumption, completion and reversal · store dispatch · customer-invoice
posting and reversal · cost updates.

Because the customer catalogue reads the balance rather than a copy of it,
every one of these is reflected on the next read with nothing to synchronise.
Each movement type is exercised against the customer-facing figure in
`npm run test:customer-ordering-stock`.

Two paths bypass `postStockMovement` deliberately and are recorded here rather
than hidden:

- `rollbackGrnStockPostings` deletes its own ledger rows and patches the
  balance back when a GRN fails to be created;
- `reverse_production_run`, a database function that row-locks the run and
  writes compensating transactions.

A static check asserts that nothing else in `src/` changes a stock quantity.

## 11. Known limitations

1. **Application-level concurrency** (§5) rather than database locks.
2. **`not_measured` products are orderable.** A product with no stock record
   can be ordered in any quantity. That is deliberate — a company not tracking
   stock must still be able to sell — but it means availability is only as good
   as the stock records.
3. **The staff "Avail" column is gross.** `buildPickingList` shows on hand
   without subtracting reservations, while approval enforces the net figure.
   The screen can show more than approval will allow. Not changed here because
   it alters a number staff read daily.
4. **A price list's own status and effective dates are not checked** — only the
   assignment's status and the item's. An inactive or expired list still prices.
5. **`asOfDate` is not passed** by sales orders and invoices, so they price as
   of today rather than the order or invoice date.
6. **Orphan allocation rows are never deleted.** A cancelled order's rows stay
   `Reserved` and stop counting only through the status filter. Anything that
   queries that table without joining to the order status would over-count.

## 12. Rolling this out

Two migrations, neither applied:

| Migration | Adds | Default |
|---|---|---|
| `20260925120000_customer_price_list_coverage` | `price_source_rule` | `fallback_to_master` — today's behaviour |
| `20260926120000_customer_order_pending_hold` | `pending_hold_minutes` on the portal tenant and identity | `NULL` — not configured |

Both are additive and default to current behaviour, so applying them changes
nothing until somebody decides something. They still go through the controlled
production process.

After deployment, two things change for every company immediately, without any
configuration: customers are shown what they may order and are refused more,
and a placed order holds its stock and waits for a person. Both are the point
of the work; both should be said out loud to anyone using the ordering app
before it ships.

The business decisions that remain, per company: the hold expiry value, and
whether any customer should be priced from their assigned list only.
