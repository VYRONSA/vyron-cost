# Stock by location — requirements and design (NOT IMPLEMENTED)

Status: **requirements / design only.** As of commit 07e54de (+ QA fixes), VOLORA holds **one stock balance per company and item** (`vyron_cost_stock_items.qty_on_hand`). There is no location table tied to stock, and the stock ledger, stock counts, production runs, minimum levels and transfers carry no location. Nothing below exists yet. `vyron_stock_minimum_levels.location` is a reserved column (always `''`).

## 1. The FoodSock case

FoodSock is the **owner** of its stock and the tenant (company) the records belong to. Its stock is **physically held** in more than one place:

- FoodSock's own factory and store(s);
- Handcrafted Foods / Kingdom Foods premises (a partner / holding location);
- other locations later.

VOLORA must keep FoodSock as the owner and accounting context, while recording **where** each unit physically is. Handcrafted / Kingdom Foods is a separate tenant. Being a holding location for FoodSock must **not** give it access to FoodSock's data, and FoodSock's stock must **not** appear in Handcrafted's stock.

## 2. Data model

| Entity | Fields (essential) | Notes |
|---|---|---|
| `vyron_stock_locations` | id, **company_id** (owner tenant), code, name, type (`OWN_SITE`, `STORE`, `PARTNER_HOLDING`, `IN_TRANSIT`), holder_name (e.g. "Handcrafted Foods (Pty) Ltd"), address, is_default, active, created_by/at | Owned by the stock owner. A partner holding location is FoodSock's record *about* a place, not a link into the partner's tenant. |
| `vyron_stock_location_balances` | company_id, stock_item_id, location_id, qty_on_hand, average_cost, updated_at; unique (company_id, stock_item_id, location_id) | Per-location balance. `vyron_cost_stock_items.qty_on_hand` becomes the **sum** across locations, maintained by the same write path. |
| `vyron_cost_stock_ledger` | + location_id (and to_location_id for transfers) | Every movement names its location. |
| `vyron_stock_transfers` | id, company_id, transfer_number, from_location_id, to_location_id, status, requested_by, dispatched_by/at, received_by/at, cancelled_by/at, notes | Header. |
| `vyron_stock_transfer_lines` | transfer_id, company_id, stock_item_id, qty_sent, qty_received, unit_cost, variance_qty, variance_reason | Lines. |
| `vyron_stock_minimum_levels` | location `''` → location_id (null = company-wide) | Minimums per location, and company-wide. |
| `vyron_cost_production_runs`, `vyron_cost_stock_counts` | + location_id | Where production consumed and produced; where a count was taken. |

**Migration of existing data:** create one default location per company (e.g. "Main") and move every current balance and ledger row onto it. Totals must reconcile to the cent before and after.

## 3. Stock transfers and in-transit stock

- **Statuses:** `DRAFT → DISPATCHED → RECEIVED` (or `PARTIALLY_RECEIVED`) / `CANCELLED`. Only `DRAFT` can be edited or cancelled freely.
- **Dispatch:** a ledger movement *out of* the source location *into* the company's `IN_TRANSIT` location. Stock in transit is still owned and still valued, but available at neither end.
- **Receive:** a movement *out of* in-transit *into* the destination, quantity as received. A difference between sent and received is a recorded variance with a reason (damaged, short-shipped), never silently absorbed.
- **Cost:** moves at the source's average cost; a transfer creates no margin.
- **Totals:** the company's total quantity is unchanged by a transfer (apart from a recorded receiving variance).
- **Concurrency:** use the same compare-and-set as `postStockMovement` today, per location balance.
- **Audit:** every status change records the **verified member** (never a name from the request), with time, quantities and before/after balances. Nothing is deleted; a cancelled or reversed transfer keeps its history.

## 4. Behaviour by area

- **Production by location:** a run names its location. Consumption and output post there, availability and shortage checks use that location's balance, and the minimum-level warning uses that location's thresholds.
- **Stock take by location:** a count is for one location. The upload maps a location column to a location, or the user chooses one. Variances post to that location only.
- **Minimum levels:** set per location (and optionally company-wide). The dashboard and production warnings evaluate per location.
- **Receiving:** goods receipts and supplier deliveries name the receiving location.
- **Sales:** the issuing location is chosen per order or invoice (default location if not).
- **Reporting:** stock on hand, valuation, movements and variances by location, with a company total that reconciles to the sum of locations, plus an in-transit report.
- **Dashboard:** Attention Required and Last Production per location (e.g. "FoodSock Factory — last production today 14:32"; "Kingdom Foods premises — 3 items below minimum"), with a company roll-up.

## 5. Tenant isolation

- Every location, balance, transfer and movement carries the owner's **company_id**, is read and written only through company-scoped server routes, and has row level security enabled.
- A `PARTNER_HOLDING` location never grants the holding partner access to the owner's data. If the partner (e.g. Kingdom Foods) is to confirm receipts in VOLORA, that needs an explicit, audited cross-tenant arrangement. That is a separate design decision, not implied by the location.
- Tests must prove that company A cannot see or move company B's locations, balances or transfers, and that a partner-held location does not change either tenant's totals.

## 6. Out of scope until decided

- Whether Handcrafted / Kingdom Foods users act on FoodSock transfers (a cross-tenant workflow) or FoodSock staff record both ends.
- Bin / shelf-level locations within a site.
- Lot / batch and expiry tracking per location.
