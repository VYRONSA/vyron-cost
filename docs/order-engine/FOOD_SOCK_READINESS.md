# Order Engine — Food Sock Readiness

Purpose: be ready when Food Sock answers the sales-integration question pack.
**No Food Sock system was connected and no Food Sock data was used** to build
or test the Order Engine. Status labels as in `VALIDATION_RULES.md`.

## 1. What we already know (confirmed)

- Two web stores — one WooCommerce, one Shopify — both reaching Food Sock's
  master PostgreSQL database through Metorik.
- The master database has normalised `core.orders`, `core.order_line_items`
  (with SKU, `cogs_metorik`), `core.order_coupons`, `core.products` (no SKU),
  `core.customers`, `core.customer_identity_map`.
- SKU gaps exist in part of the line items (notably the core meal range).
- Historical reseller customers deleted from WooCommerce left orphaned
  customer ids; Metorik kept duplicate customers.
- Refund and VAT treatment is not yet agreed.
- The VYRON Food Sock tenant holds products, BOMs and stock imported from
  inFlow (`e920c747-…`); nothing in the Order Engine refers to it.

## 2. What VYRON can already support

| Need | Order Engine capability | State |
|---|---|---|
| Web-store orders into one inbox | WooCommerce and Shopify converters, store key in the identity | NOT CONNECTED (built, tested) |
| Two stores kept apart | source key `<store>:order:<id>`; identity map per source + reference | IMPLEMENTED, TESTED |
| Customer identity without merging | remembered source references (`identity_map`); ambiguity is an exception; nothing merged or created | IMPLEMENTED, TESTED |
| SKU gaps | exact matching only; unmatched lines become exceptions; a person's choice can be remembered per customer | IMPLEMENTED, TESTED |
| Tax-inclusive store prices | recorded; block approval until converted | IMPLEMENTED, TESTED |
| Refunds already on the platform | recorded; warning; never netted; fully refunded / cancelled orders refused | IMPLEMENTED, TESTED |
| Coupons, shipping | recorded; coupon already in line discounts; shipping warned, not carried | IMPLEMENTED, TESTED |
| B2B orders by e-mail (e.g. retailer POs as CSV) | e-mail boundary; CSV attachments become orders | NOT CONNECTED (built, tested) |
| Approval before a sales order exists | full approval workflow into the existing Sales Orders | IMPLEMENTED, TESTED |
| Customer ordering rules | optional per-customer policies | IMPLEMENTED; values REQUIRE CLIENT INFORMATION |
| B2B and B2C in one pipeline | order context (B2B / B2C) and channel on every order; unknown web customers booked only to a chosen B2C account | IMPLEMENTED, TESTED; account REQUIRES A DECISION (D2) |
| Excel and PDF orders by e-mail | XLSX attachments read like CSV; PDFs held as "document not read yet" | NOT CONNECTED (built, tested) |
| Document / AI extraction | canonical extraction contract with per-field confidence and as-written values | IMPLEMENTED, TESTED; no extractor connected |
| What the customer actually sent | frozen source snapshot per order and line; any later change raised to the approver | IMPLEMENTED, TESTED |
| Store product / customer ids | matched through `vyron_import_source_links` when a link exists; never guessed | IMPLEMENTED, TESTED; links REQUIRE MAPPING (D9) |
| Production visibility | production required per product with BOM components, component stock and shortfall (estimate) | IMPLEMENTED, TESTED |
| Tenant decisions | ordering settings: B2C account, name matching, repeated-PO action, lead time | IMPLEMENTED, TESTED |
| UAT | fictional Food Sock-shaped catalogue and 13 scenarios (`npm run uat:food-sock`, `npm run test:order-engine-food-sock`); can run on a catalogue snapshot file | IMPLEMENTED |

Open business decisions: `FOOD_SOCK_OPEN_DECISIONS.md`.

## 3. What must be confirmed by Food Sock

| # | Question | Blocks |
|---|---|---|
| F1 | Are web-store orders **operational** orders VYRON should fulfil, or only **historical sales** for reporting? | whether the converters are used at all — historical sales must go to the separate external-sales design, never the Order Engine |
| F2 | Which B2B customers order, how (e-mail, portal, CSV, EDI) and in what format? | choosing the first live source |
| F3 | Do store prices include VAT, per store? | tax conversion step |
| F4 | How is shipping billed? | shipping handling |
| F5 | Which store statuses mean "ready to fulfil"? | status filter |
| F6 | Are the store SKUs the same codes as the VYRON (inFlow) product SKUs? | matching rate |
| F7 | Which customers need a PO, delivery days, minimums, case quantities? | customer policies |
| F8 | Who approves orders, and should the person who enters an order be allowed to approve it? | roles; separation of duties |
| F9 | Should staff be notified of new / approved orders, and by which channel? | notifications (off today) |
| F10 | Connection method for any live source (store API keys, webhook, mailbox) | connecting a source |

## 4. Sample information that would help

- 3–5 real (anonymised if preferred) B2B orders in the format they arrive.
- One WooCommerce and one Shopify order JSON export per store (a test order is
  enough) to confirm the converters against their actual configuration.
- A list of customer item codes that differ from VYRON SKUs.
- The customer list with which customers order directly.

## 5. What will NOT be assumed

- No retailer (e.g. SPAR, Pick n Pay) ordering frequency, format or rules.
- No approval thresholds, price tolerances, margin minimums or delivery rules.
- No VAT treatment, refund allocation or COGS meaning.
- No customer merging on name, e-mail, phone or address.
- No fuzzy product matching.
- No connection to Food Sock's database, stores or mailbox without explicit
  authorisation and a safe configuration.
