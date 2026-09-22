# Order Engine — Validation Rules

Status legend used throughout the Order Engine documents:

| Label | Meaning |
|---|---|
| **IMPLEMENTED** | In code on `feat/order-engine-foundation` |
| **TESTED** | Covered by an automated suite named in the row |
| **DESIGNED** | Specified here; not built |
| **NOT CONNECTED** | Built and tested against a documented format; no live account is connected |
| **REQUIRES CLIENT INFORMATION** | Cannot be configured until the client confirms a business rule |

Source of truth: `src/lib/order-engine/issue-catalog.ts` (meaning, level, action)
and `src/lib/order-engine/validation.ts` (the checks). The table below is
generated from the catalogue.

## 1. How validation works — IMPLEMENTED, TESTED

1. **Load once.** `loadValidationContext` reads the customer, the product
   matches, prices (one lookup per product), stock on hand, stock reserved by
   *live* sales orders, BOM presence, confirmed pack sizes (only when a policy
   needs them), the customer's order policy and earlier orders with the same
   PO — all inside the company.
2. **Pure validators.** Eleven validators (customer, product, quantity, price,
   stock, margin, commercial, arithmetic, policy, tax, extraction) run over that
   context without touching the database. Adding a rule is a new entry in
   `VALIDATORS` plus a catalogue entry.
3. **Three levels.**

   | Level | Effect |
   |---|---|
   | **BLOCKING** | The order moves to *Exception* and cannot be approved until resolved. |
   | **WARNING** | The approver must tick an acknowledgement; the acknowledged codes are written into the approval event. |
   | **INFORMATION** | Shown; no action required. |

4. **Snapshot.** The result (issues, per-line evaluation, totals, matching
   summary, policy used) is stored on the order with a hash. Approval
   re-validates against live data and is refused if the hash differs.

## 2. The rule catalogue — IMPLEMENTED, TESTED

Tested by `test:order-engine` (171), `test:order-engine-fixtures` (214, every
fixture's expected codes), `test:order-engine-controls` (126).

| Code | Meaning | Category | Level | When | Action required |
|---|---|---|---|---|---|
| `CUSTOMER_NOT_FOUND` (brief: `UNMATCHED_CUSTOMER`) | Customer not identified | customer | **BLOCKING** | always | Choose the customer. Optionally remember the order's customer reference for next time. |
| `CUSTOMER_AMBIGUOUS` | More than one possible customer | customer | **BLOCKING** | always | Choose which customer placed the order. |
| `CUSTOMER_INACTIVE` | Customer is not active | customer | **BLOCKING** | always | Reactivate the customer in the Customer Register, or reject the order. |
| `CUSTOMER_ON_HOLD` | Customer is on hold | customer | WARNING | always | Confirm the order may proceed while the customer is on hold. |
| `CUSTOMER_MATCHED_BY_EMAIL` | Customer identified by sender e-mail only | customer | WARNING | always | Confirm the sender really is this customer. |
| `PRODUCT_UNMATCHED` (brief: `UNMATCHED_PRODUCT`) | Product not identified | product | **BLOCKING** | always | Choose the product. Optionally remember the customer's item code for next time. |
| `PRODUCT_AMBIGUOUS` (brief: `AMBIGUOUS_PRODUCT`) | More than one possible product | product | **BLOCKING** | always | Choose between the listed products. |
| `PRODUCT_MATCHED_BY_NAME` | Product identified by name only | product | WARNING | always | Confirm the product — the line had no SKU. |
| `DUPLICATE_PRODUCT_LINE` | Same product on two lines | product | WARNING | always | Confirm both lines are intended. |
| `INVALID_QUANTITY` | Quantity is not a positive number | quantity | **BLOCKING** | always | Correct the quantity with the customer. |
| `CASE_QUANTITY` | Not a whole number of cases | policy | WARNING | customer rule (off unless set) | Confirm the quantity, or round to whole cases with the customer. |
| `PRICE_LOOKUP_FAILED` | Price could not be looked up | price | **BLOCKING** | always | Check the product and the customer's price list, then validate again. |
| `PRICE_MISSING` | No price | price | **BLOCKING** | always | Enter the agreed price, or set a price for the product. |
| `PRICE_NEGATIVE` | Negative price | price | **BLOCKING** | always | Correct the price. |
| `PRICE_ZERO` | Zero price | price | **BLOCKING** | always | Enter the price or remove the line — Sales Orders cannot carry a free line without substituting a price. |
| `PRICE_MISMATCH` | Price differs from VYRON's price | price | WARNING | always | Confirm the order price, or correct it to the price list. |
| `PRICE_FROM_VYRON` | Price taken from VYRON | price | INFORMATION | always | None — the order had no price, so the customer or standard price is used. |
| `INSUFFICIENT_STOCK` | Not enough stock | stock | WARNING | always | Confirm the order may proceed; plan production or a partial delivery. |
| `PRODUCTION_REQUIRED` | Production required | production | INFORMATION | always | None now — the sales order can raise the production run. |
| `NO_BOM_FOR_SHORTFALL` | Short with no BOM to produce it | production | WARNING | always | Confirm how the shortfall will be supplied. |
| `NEGATIVE_MARGIN` | Selling below cost | margin | WARNING | always | Confirm the price is intended. |
| `LOW_MARGIN` | Margin below the customer's minimum | margin | WARNING | customer rule (off unless set) | Confirm the price is intended. |
| `MARGIN_NOT_MEASURED` | Margin not measured | margin | INFORMATION | always | None — some products have no cost in VYRON. |
| `DELIVERY_DATE_PAST` (brief: `PAST_DELIVERY_DATE`) | Delivery date is in the past | commercial | WARNING | always | Agree a new delivery date with the customer. |
| `POSSIBLE_DUPLICATE_PO` (brief: `DUPLICATE_ORDER`) | PO already received | commercial | WARNING | always | Check it is not a duplicate of the listed order(s). |
| `NO_LINES` | No lines | commercial | **BLOCKING** | always | Reject or cancel the order. |
| `MISSING_PO` | PO number required | policy | **BLOCKING** | customer rule (off unless set) | Get the PO number from the customer and enter it. |
| `MISSING_DELIVERY_DATE` | Delivery date required | policy | **BLOCKING** | customer rule (off unless set) | Agree a delivery date with the customer and enter it. |
| `BELOW_MINIMUM_ORDER` | Below the customer's minimum order | policy | WARNING | customer rule (off unless set) | Confirm the order may proceed below the minimum. |
| `DELIVERY_DAY_NOT_ALLOWED` | Not a delivery day for this customer | policy | WARNING | customer rule (off unless set) | Confirm the delivery date with the customer. |
| `SPECIAL_INSTRUCTIONS` | Customer special instructions | policy | INFORMATION | customer rule (off unless set) | Read the instructions before approving. |
| `LINE_TOTAL_MISMATCH` (brief: `INVALID_TOTAL`) | Line total does not add up | arithmetic | WARNING | stated by the source | Check quantity, price and discount against the customer's order. |
| `SUBTOTAL_MISMATCH` (brief: `INVALID_TOTAL`) | Order subtotal does not add up | arithmetic | WARNING | stated by the source | Check the lines against the customer's order. |
| `PRICES_INCLUDE_TAX` | Source prices include tax | tax | **BLOCKING** | stated by the source | Enter ex-tax prices and confirm the conversion — Sales Orders add tax on top. |
| `SHIPPING_NOT_CARRIED` | Shipping charge not carried | tax | WARNING | stated by the source | Confirm how the stated shipping charge will be billed; it is not added to the sales order. |
| `SOURCE_PARTIAL_REFUND` | Already partly refunded at source | tax | WARNING | stated by the source | Confirm which items are still to be supplied before approving. |
| `COUPON_APPLIED` | Coupon applied at source | tax | INFORMATION | stated by the source | None — line discounts already include it. |
| `EXTRACTION_REVIEW` | Read automatically — review | extraction | WARNING | stated by the source | Check the extracted values against the original document. |
| `EXTRACTION_LOW_CONFIDENCE` | Uncertain extracted value | extraction | **BLOCKING** | stated by the source | Correct or confirm the value from the original document. |

Why some levels are what they are:

- **`PRICE_ZERO` blocks** because the existing sales-order engine replaces a zero
  price with the product-master price on save; a free line cannot be handed
  off without its price silently changing.
- **`PRICES_INCLUDE_TAX` blocks** because sales orders price ex-tax and add the
  workspace VAT rate: carrying a tax-inclusive price would overcharge.
- **Stock shortage is a warning**, not a block: production and partial delivery
  are normal business. The existing sales-order engine still refuses to reserve
  stock it does not have when the sales order is approved.
- **Margin messages never quote a cost**: members without approve permission
  see "Margin check — visible to approvers" (redaction).

## 3. Deterministic matching — IMPLEMENTED, TESTED

**Never fuzzy.** Each rung is an equality after minimal normalisation; it finds
exactly one record, reports *ambiguous* with the exact candidates, or passes on.
Every query is inside the company. Code: `src/lib/order-engine/matching.ts`.

### Products

| Rung | Rule | Result |
|---|---|---|
| 0 | A product a person chose for this line | `manual` |
| 1 | An approved alias for **this customer's** code (or description, when the line has no SKU) | `customer_alias` — outranks a coincidental SKU, for that customer only |
| 2 | Exact SKU (byte-equal) — batched in one query per order | `sku_exact` |
| 3 | SKU ignoring case and surrounding spaces | `sku_normalized` |
| 4 | Approved company-wide alias, then the accounting item-code mappings used by the invoice import | `alias` |
| 5 | Exact normalised name — **only when the line has no SKU**, and raised as a warning | `name_exact` |
| — | Nothing, or more than one at any rung | `UNMATCHED` / `AMBIGUOUS` → blocking |

A line that states a SKU which is not found is **UNMATCHED**; it never falls
through to a name. `HK-TART` shared by two products lists both and asks.
Normalisation keeps hyphens and inner characters (`AB-1 ≠ AB1`).

### Customers

| Rung | Rule | Result |
|---|---|---|
| 0 | A customer a person chose | `customer_id` |
| 1 | A remembered source reference (source + reference, e.g. a web-store customer id) | `identity_map` |
| 2 | Exact normalised name, exactly one customer | `name_exact` |
| 3 | Sender e-mail (e-mail source only), exactly one customer — raised as a warning | `sender_email` |
| — | None, or more than one | `CUSTOMER_NOT_FOUND` / `CUSTOMER_AMBIGUOUS` → blocking |

Customers are **never merged or created**: two customers sharing a name or an
e-mail address are ambiguous; a remembered reference cannot be re-pointed to a
different customer (revoke first); the same web-store customer id from a
different store is a different reference.

### Remembering a decision — IMPLEMENTED, TESTED

When a person resolves an unmatched line or customer they may tick *remember*
(approvers only). VYRON records an alias (customer + code → product) or an
identity (source + reference → customer). These are revoke-only records
(`vyron_order_product_aliases`, `vyron_order_customer_identities`): the
database refuses edits and deletes, allows one live mapping per key, and keeps
revoked ones for history. Screens: *Order rules & mappings*.

## 4. Customer order policies — IMPLEMENTED, TESTED; values REQUIRE CLIENT INFORMATION

A policy is optional, per customer, with an optional company default. **Every
rule is off until switched on.** Reused from existing VYRON structures instead
of duplicated:

| Rule | Where it lives |
|---|---|
| Customer price / contract price | existing customer price lists (contract → default → product master) |
| On hold, inactive | existing `vyron_customers.on_hold`, `status`, `active` |
| Case size | existing `vyron_cost_product_pack_sizes` — **confirmed** figures only |
| Payment terms, credit limit | existing customer fields; the sales-order engine's own approval checks credit on submit |
| Required PO, required delivery date, minimum order value, minimum margin %, whole cases, delivery weekdays, special instructions | `vyron_customer_order_policies` (new) |
| Order cut-off time | stored; **not evaluated** — DESIGNED (needs the client's lead-time and time-zone rule) |
| Allowed-products list | DESIGNED — no client has asked; would be a policy child table |

## 5. What needs client information before it is switched on

| Rule | Question for the client |
|---|---|
| Price tolerance | Is any difference from the price list acceptable (today: any difference over R0.005 warns)? |
| Minimum margin | What margin should trigger a warning, per customer? (Off by default; the sales-order engine's hard-coded 30% is not copied.) |
| Case quantities | Are orders placed in units or cases, and which pack sizes are confirmed? |
| Delivery days and cut-off | Which days does each customer receive, and what is the order cut-off? |
| Required PO | Which customers must quote a PO? |
| VAT basis per source | Do web-store prices include VAT (per store)? |
| Shipping | Is shipping billed on the invoice, and how? |
