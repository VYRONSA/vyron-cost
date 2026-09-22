# Food Sock — open business decisions (ordering)

Decisions only Food Sock can make. The same list is live in the product:
**Order Inbox -> Order rules -> Decisions** shows each one as decided or
awaiting, what it is configured as, and exactly what happens until it is
decided. Production status: `FOOD_SOCK_PRODUCTION_READINESS.md`.

The Order Engine guesses none of them: each is a tenant setting or customer
rule, starts in the safe state below, and stops the order where proceeding
could change it materially.

| # | Decision | Where it is set | Until decided | Blocks? |
|---|---|---|---|---|
| D1 | Are web-store (WooCommerce / Shopify) orders **orders to fulfil** in VOLORA, or only historical sales? | Ordering settings → web-store orders | a web order is received but held (`WEB_ORDERS_MODE_NOT_DECIDED`); "history only" refuses it at intake | yes |
| D2 | How B2C web orders are **booked**: one "web store" customer account, or per-customer accounts? | Ordering settings → B2C account | a web order from an unknown customer stops (`B2C_ACCOUNT_NOT_CONFIGURED`) | yes |
| D3 | Do store prices **include VAT** (per store)? | stated by the store on each order | tax-inclusive orders stop until a person enters ex-tax prices (`PRICES_INCLUDE_TAX`) | yes |
| D4 | How is **shipping** billed? | — | shipping is shown, not added to the sales order (`SHIPPING_NOT_CARRIED`) | warning |
| D5 | Which retail customers need a **PO**, a **delivery date**, **delivery days**, a **minimum order**, **whole cases**, a **minimum margin**? | Order rules → per customer | no rule is applied | per rule |
| D6 | A repeated customer PO / order reference: **warn or block**? | Ordering settings | warn (approver acknowledges) | configurable |
| D7 | May an order line **without a SKU** match by exact product name? | Ordering settings | allowed, always raised for review | warning |
| D8 | Minimum **lead time** between order and delivery? | Ordering settings | not checked | warning |
| D9 | Do store / retailer **SKUs equal VOLORA SKUs**? If not, which codes map to which products? | remembered mappings, or source links | unmatched lines stop (`PRODUCT_UNMATCHED`); no fuzzy matching | yes |
| D10 | Which web-store **statuses** mean "ready to fulfil"? | store connection | cancelled / refunded / failed / draft are refused; everything else is received | — |
| D11 | **Who approves**, and may the person who enters an order approve it? | workspace roles | any member with approve permission | — |
| D12 | Which **inbox / channel** carries B2B orders, and which **document extractor** reads PDFs? | mailbox + extractor connection (none) | PDFs are held as "document not read yet" in the Exception Centre | yes (for that document) |

Deliberately **not** decided by the engine:

- Approving an order never produces, reserves, purchases, invoices, e-mails or
  posts to Xero. Production requirements are shown (with BOM components) for
  the existing manufacturing workflow to act on.
- Historical Metorik / WooCommerce orders are never converted into sales
  orders or invoices here (`purpose: "historical"` is refused at intake).
