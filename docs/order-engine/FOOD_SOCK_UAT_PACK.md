# Food Sock — ordering UAT pack

**FICTIONAL / NON-PRODUCTION.** Every order, customer, product, price, mailbox,
store and document in this pack is invented. Nothing here reads or writes
production, and no provider, mailbox or store is connected. Runs are in memory
or against a disposable local database.

Two commands produce the evidence:

```
npm run uat:food-sock                 # the order scenarios, on a catalogue
npm run test:order-engine-food-sock   # the channel paths and the engine contract
npm run test:order-engine-activation  # the activation stages and their conditions
```

`uat:food-sock` runs against the fictional catalogue by default, and against a
Food Sock catalogue snapshot with `-- --snapshot <file>` (Stage 2 of the
activation runbook). Its banner always states which, and always says
NON-PRODUCTION.

## A. Order scenarios (`npm run uat:food-sock`)

Each one states the order, the expected outcome and the exact issues raised.

| # | Scenario | Expected outcome |
|---|---|---|
| 1 | valid-b2b | Awaiting approval, no issues; approval creates a **Draft** sales order and nothing else |
| 2 | valid-b2c | Awaiting approval; the first one from the web store is raised for a person (scenario 14) |
| 3 | unknown-sku | Exception — `PRODUCT_UNMATCHED`; nothing is guessed |
| 4 | unknown-customer | Exception — `CUSTOMER_NOT_FOUND`; no customer is created |
| 5 | duplicate-po | Warning — `POSSIBLE_DUPLICATE_PO`, pointing at the earlier order |
| 6 | insufficient-stock | Warning — `INSUFFICIENT_STOCK`, plus `NO_BOM_FOR_SHORTFALL` where nothing can be made |
| 7 | production-required | Warning — `PRODUCTION_REQUIRED` with the BOM components and shortfalls |
| 8 | low-margin | Warning — `PRICE_MISMATCH` and `LOW_MARGIN` against the customer's own rule |
| 9 | missing-po | Exception — `MISSING_PO` (only where that customer requires one) |
| 10 | missing-delivery-date | Exception — `MISSING_DELIVERY_DATE` |
| 11 | invalid-quantity | Exception — `INVALID_QUANTITY` |
| 12 | ambiguous-mapping | Exception — `CUSTOMER_AMBIGUOUS`; two candidates, no choice made |
| 13 | low-confidence-extraction | Exception — `EXTRACTION_LOW_CONFIDENCE` per uncertain field |
| 14 | first live order from a channel | Warning — `FIRST_LIVE_ORDER_FROM_CHANNEL`; an approver acknowledges it by name |

Every run also proves, on every scenario: nothing was invoiced, no Xero queue
row was written, no stock moved, nothing was reserved, and the frozen source
snapshot still matches what the source sent.

## B. Channel paths

Each path is exercised on the fictional tenant.
The last three use no provider and no credential at all.

| Path | What is tested | Provider needed |
|---|---|---|
| **Entered by hand** | A person keys an order in; it validates like any other | none |
| **CSV** | A customer's CSV becomes an order; ambiguous numbers, non-ISO dates, duplicate columns and unknown columns are refused or recorded rather than guessed | none |
| **Excel** | The same mapping from a workbook; an unreadable workbook fails with a reason and creates no order | none |
| **PDF** | Simulated. A PDF is accepted, held as "document not read yet", and recorded as a NOT_CONFIGURED extraction attempt. With a fictional extractor registered, the canonical contract, per-field confidence, retained raw values and page references, and low confidence blocking approval are all proved | **no** — no provider is connected |
| **E-mail** | Simulated. A message is handed over the connector boundary with the address it was delivered to; the tenant is resolved from that address only; sender policy, attachment policy, duplicates and the provider's own SPF/DKIM/DMARC results decide whether it is accepted or quarantined | **no** — no mailbox is connected |
| **Web store** | Simulated. WooCommerce and Shopify payloads are normalised, discounts counted once, cancelled and refunded orders refused, tax basis taken from the store, and unknown customers stopped | **no** — no store is connected |

## C. Activation (`npm run test:order-engine-activation`)

| Check | Expected |
|---|---|
| The stages | Disabled → Configured → Ready for UAT → UAT passed → Ready for activation → Active, and Active ⇄ Suspended |
| Skipping a stage | Refused |
| Recording UAT as passed | Refused without the evidence reference |
| Suspending | Refused without a reason |
| Activating | Refused while any of that channel's conditions is outstanding |
| Having credentials | Never enough on its own |
| A connector while its channel is off | Refuses the work, stores nothing, records the attempt against the channel |
| Channels together | Suspending one leaves the others working |
| The first live order | Recorded on the channel and raised to a person |
| Another tenant | Sees its own channels only |

## D. What UAT does not cover

- Real Food Sock data. Use a catalogue snapshot for Stage 2; even then, orders
  and customers in the pack stay fictional.
- Any real mailbox, extractor or store. Those are tested once, against the real
  provider, in Stages 4–6 of the activation runbook — outside production.
- Invoicing, Xero, manufacture and stock movements, because approval does none
  of them. That is asserted, not exercised.
