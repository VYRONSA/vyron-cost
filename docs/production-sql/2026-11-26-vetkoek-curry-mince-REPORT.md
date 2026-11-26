# Vetkoek & Curry Mince 100g cannot be ordered — root cause (2026-11-26)

Production `pnbstrqsrfoubdgcgimi` was investigated read-only. Nothing was changed.

## Symptom

Every portal order that included "Vetkoek & Curry Mince 100g" since 20 Nov was created and then cancelled within about 2 seconds, with actor `vyron-order (stock no longer available)`. That is 8 orders, all from Bakers Square Bakers CC (outlets Canal Walk, Cape Gate and Gables):

| Order | Date | Notes (outlet) |
|---|---|---|
| SO-64185150 | 20 Nov | Canal Walk |
| SO-64207088 | 20 Nov | Canal Walk |
| SO-64295554 | 20 Nov | Canal Walk |
| SO-64372676 | 20 Nov | Canal Walk |
| SO-64503783 | 20 Nov | Cape Gate |
| SO-64887013 | 20 Nov | Canal Walk |
| SO-37453929 | 23 Nov | Gables |
| SO-82087488 | 26 Nov | Canal Walk |

- The customer was shown "We cannot supply everything in your order. Please check the quantities."
- The same order without the vetkoek line then went through.
- No customer, contact, portal login, store or branch named "Donuts Centre" exists in production.

## Root cause

**1. Data.**
- On 11 Nov staff created two new identical products: `454c2f27…` and `81bcddb2…`. Both went onto price list "5" at R9.05.
- They removed the original `b540f483…` from list "5" (10 Nov) and list "2" (6 Nov), and archived it on 13 Nov.
- These were left on the archived original: the finished-goods stock item FG-B540F483 (408 on hand), the pack size (24 per box) and BOM 90e3a1b9.
- The products customers can order therefore have no stock record.

**2. Platform defect.**
- The customer catalogue and cart (`vyron-order-catalogue.ts`, `vyron-order-cart.ts`) treat a product with no stock record as "not measured" but still orderable.
- Placing the order runs `reserveStockForSalesOrder`, which goes through `checkAndReserveStock` and `buildPickingList`. That path counts no stock record as 0 on hand, so it throws `SALES_ORDER_STOCK_SHORTAGE`.
- `submitCart` then cancels the new order.
- The two rules disagree, so the customer is offered something that can never be placed.

## Scope

- 16 products are on the active price lists of active portal customers but have no finished-goods stock record. All of them fail the same way.
- 8 active portal customers have at least one such product on their list.
- Price-list customers on list "2" (Bakers Square, Samples) lost the product on 6 Nov through a deliberate removal. That is a business decision and is not changed here.

## Correction

- **Data, restores ordering:** `2026-11-26-vetkoek-curry-mince-stock-relink-PROPOSED.sql`.
  - It re-links the stock item, pack size and BOM to `81bcddb2…` and archives `454c2f27…`.
  - No quantity, price, price list or ledger row changes.
  - It has been dry-run on QA, including the rollback.
- **Code, hotfix branch `hotfix/portal-unmeasured-stock`:**
  - The catalogue marks a product with no stock record as not orderable online ("Not available online").
  - The customer sees the true reason before building the order, instead of a cancelled order.
  - Test: `test:customer-ordering-stock` passes 116/116. The 5 new checks fail on the old code.
