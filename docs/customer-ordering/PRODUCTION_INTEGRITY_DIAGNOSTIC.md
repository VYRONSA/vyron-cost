# Production integrity diagnostic — VOLORA Customer Ordering

The diagnostic (`scripts/customer-ordering-integrity-diagnostic.mjs`) is
generic: it takes a company id and reports on that company. It names no client
and hardcodes no company. What follows is **the evidence from the first run**,
against one company, which is what established that the platform defect found
in the Phase 4 audit (`docs/ARCHITECTURE/CUSTOMER-ORDERING-STOCK-AUDIT.md`) had
not damaged live data.

The defect it exposed was **platform-level, not client-specific**; the
correction is in `docs/customer-ordering/CUSTOMER_ORDERING_STOCK_INTEGRITY.md`
and applies to every company.

**Customers are anonymised in this document.** The tenant's own customers are
third parties, so each is referred to by a stable label — Customer 1, Customer
2 and so on — used consistently throughout. Every count, gap figure and
conclusion is the real one. Anyone re-running the diagnostic against the same
company gets the names back in their own terminal; they are deliberately not
committed here.

**Production writes: zero.** The diagnostic
(`scripts/customer-ordering-integrity-diagnostic.mjs`) does not use a database
client. It speaks to PostgREST over plain HTTP and issues GET requests only;
`fetch` is wrapped so that anything other than GET throws before it leaves the
process. 272 GET requests were made. Nothing was written, no migration was
applied and no correction function exists in that file.

| | |
|---|---|
| Database | `pnbstrqsrfoubdgcgimi` — allowlisted **production**, confirmed by Gerhard 2026-09-15 |
| Company read | `851d2acb-b5c5-43a6-9dfb-f7df93c4ce2b` |
| Run | 2026-09-23, read-only |

---

## 0. Which company this run covered

**The reporting customer is not a tenant in the production database.** It holds
five companies with data:

| Company id | Has |
|---|---|
| `4cf86f18-…` | workspace only |
| `e920c747-…` | workspace, products, stock |
| `851d2acb-…` | workspace, products, customers, stock ← **the company read** |
| `21905377-…` | workspace, products, customers, stock |
| `94797ab8-…` | customers only, no workspace row |

The reporting customer — **Customer 15** below — appears in production as
**seven separate customer records inside the company that was read**, all
Active, their names near-duplicates of one trading name:

```
  record 1   Active   the trading name, upper case
  record 2   Active   the trading name + " INTERNATIONAL (Pty) Ltd"
  record 3   Active   as record 2, with a trailing "E" — almost certainly a typo
  record 4   Active   the trading name with the space removed
  record 5   Active   the trading name + " Africa"
  record 6   Active   the trading name + " Kiosk", carrying the tenant's own name too
  record 7   Active   the trading name + " loan account", lower case
```

The reconciliation below was therefore run against **company
`851d2acb-…`**, because that is where those records live. This inference is
recorded here rather than assumed silently: **if the reporting customer is
meant to be its own tenant, or one of the other four, say so and the same
diagnostic can be re-run against it in minutes.**

Seven near-duplicate records for one trading name is itself a finding. It is
consistent with the known contact-data problem in this tenant, and it matters
here because a price list, an ordering login and an order history all attach to
*one* customer record.

---

## 1. Stock

| | |
|---|---|
| Stock items | 258 |
| Stock master total | **187 996.0937** |
| Ledger total (last `balance_after` per item) | **187 996.0937** |
| Exact matches | **189** |
| **Confirmed discrepancies** | **0** |
| No ledger movement to compare | 69 — every one of them has zero on hand |

**No discrepancy found.** The Stock Master agrees with the stock ledger for
every item that has ever moved, to four decimal places, and the totals are
identical.

This is the direct answer to the question the Phase 4 audit raised: the
lost-update race in `postStockMovement` was real and reproducible, but **it has
not damaged this tenant's stock**. The 69 items with no ledger row are stock
records created but never moved, all at zero — nothing to reconcile, not a
discrepancy.

## 2. Reservations

| | |
|---|---|
| Allocation rows in the tenant | **0** |
| Status `Reserved` | 0 |
| Holding stock now | 0 |
| **Orphan reservations** | **0** |

**No discrepancy found — and nothing has ever been reserved.** The allocations
table is empty for this tenant, which means the staff approval path that
reserves stock has never run here. The five customer orders that exist (§5)
reserved nothing, exactly as the Phase 4 audit predicted for the behaviour
before the fix.

There is therefore nothing to clean up, and the orphan-reservation risk
described in the audit is theoretical in this tenant rather than actual.

## 3. Price lists

| | |
|---|---|
| Customers | 404 |
| With an Active price-list assignment | **12** |
| Without any price list | **392** |
| Products a customer can see | 62 of 62 |
| Customers whose list covers everything they can see | **0** |
| **Customers with uncovered products** | **12 of 12** |

Every customer that has a price list has gaps in it:

| Customer | Products with no price on their list |
|---|---|
| Customer 1 | 60 of 62 |
| Customer 2 | 58 of 62 |
| Customer 3 | 56 of 62 |
| Customer 4 | 55 of 62 |
| Customer 5 | 55 of 62 |
| Customer 6 | 54 of 62 |
| Customer 7 | 53 of 62 |
| Customer 8 | 52 of 62 |
| Customer 9 | 52 of 62 |
| Customer 10 | 50 of 62 |
| Customer 11 | 44 of 62 |
| Customer 12 | 38 of 62 |

**All seven records of Customer 15 have no price list at all.** Every product
they can see is priced from the product master.

**Confirmed: price-list coverage is not complete.** Under today's rule those
customers are quoted the master price for the uncovered products. Under the
`assigned_list_only` rule added in `ea3fa5a`, those products would become
unavailable to them instead — which is why that rule is **configuration per
customer and defaults to the existing behaviour**. Turning it on for a customer
before their list is completed would hide most of the catalogue from them.

## 4. Finished goods (legacy bucket)

| | |
|---|---|
| `vyron_finished_goods` | present, **empty (0 rows)** |
| Discrepancies | **0** |

**No discrepancy found.** The legacy finished-goods table carries no rows at
all, so the second-balance risk described in the audit does not exist in this
database.

## 5. Is the ordering application in use?

| | |
|---|---|
| Customer sign-ins configured | 3 |
| Carts | 3 |
| Customer submissions | 5 |
| Sales orders in the tenant | 5 |

The three customers with an ordering login are:

| Customer | Price list |
|---|---|
| Customer 13 | none — priced from the product master |
| Customer 14 | none — priced from the product master |
| Customer 8 | one list, covering 10 of 62 products |

**No record of Customer 15 has an ordering login.** Whoever reported the
problem is either using one of these three accounts, or is looking at a
different tenant or environment. That is worth resolving before anything is
corrected.

## 6. Risk

| Risk | State |
|---|---|
| Stock corrupted by the lost-update race | **No discrepancy found.** Fixed in `ea3fa5a` before it caused damage here |
| Stock held by orphan reservations | **No discrepancy found.** Nothing has ever been reserved in this tenant |
| A second, competing stock balance | **No discrepancy found.** The legacy table is empty |
| Customers quoted a price nobody agreed | **Confirmed.** 392 customers have no price list; the 12 that do have gaps of 38–60 products |
| Customers ordering more than exists | **Confirmed by code, not yet by damage.** Five orders exist and none reserved anything; the fix in `ea3fa5a` closes it |
| Duplicate records for Customer 15 | **Confirmed.** Seven records for one trading name |
| Which tenant the reporting customer belongs to | **Requires investigation.** See §0 |
| Who reported the symptom, and against which account | **Requires investigation.** See §5 |

## 7. Correction plan

**None is proposed, and none is required by the four diagnostics.** Stock,
reservations and the legacy bucket all reconcile; there is nothing to correct.

The two items that do need action are configuration and data entry by the
business, not corrections to broken records:

| # | Item | Current | Expected | Evidence | Proposed action | Impact | Approval |
|---|---|---|---|---|---|---|---|
| 1 | Seven records for Customer 15 | 7 Active records for one trading name | One record, or a stated reason for each | §0 | **Business decides** which is the real trading account. Merging customer records changes order and invoice history and must be its own controlled operation | history, pricing, statements | Named approver, separate operation |
| 2 | Price-list coverage | 392 customers with no list; 12 with gaps of 38–60 products | Whatever the business intends | §3 | **Business completes the lists**, or accepts the master price as the rule for uncovered products | which price a customer is quoted | Business decision, no code change |

Neither is a data-integrity defect. Neither may be executed by engineering.

## 8. What was fixed in code, and what is still not switched on

`ea3fa5a` (audit) and this phase added, on the branch, **not deployed**:

- availability shown to customers and enforced server-side, from the one
  calculation staff approval uses;
- a placed customer order holds its stock atomically, and enters **Awaiting
  Approval** — never approved automatically;
- an unapproved order's hold **expires** after a configurable period, is
  cancelled through the ordinary order lifecycle, and the stock becomes
  available immediately. **The period is NOT CONFIGURED by default**, so
  nothing expires in any live tenant until somebody chooses the number
  (migration `20260926120000`, not applied);
- the price-list rule is configuration per customer, defaulting to today's
  behaviour (migration `20260925120000`, not applied).

## 9. Exactly what was read

`vyron_workspaces`, `vyron_customers`, `vyron_cost_products`,
`vyron_cost_stock_items`, `vyron_cost_stock_ledger`,
`vyron_customer_sales_orders`, `vyron_customer_sales_order_allocations`,
`vyron_customer_price_list_assignments`, `vyron_customer_price_list_items`,
`vyron_finished_goods`, `vyron_customer_portal_tenants`,
`vyron_customer_portal_identities`, `vyron_customer_order_carts`,
`vyron_customer_order_submissions`.

Every one with `GET`. Nothing else was touched.
