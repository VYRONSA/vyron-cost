# Online Store Sales Sync (Shopify + WooCommerce)

**Scope: sales and credits only.** Every Shopify and WooCommerce sale becomes a
VOLORA customer invoice, and every refund/credit becomes a VOLORA credit note
against it. Nothing else is integrated: no stock, purchasing, production,
logistics, Xero or other store processes. Status: **built and tested; NOT
deployed; migration `20261004120000_vyron_store_sales_sync.sql` NOT applied.**
Setup: [FOODSOCK_STORE_CONNECTION_GUIDE.md](FOODSOCK_STORE_CONNECTION_GUIDE.md).

## 1. One sales truth

```
Shopify webhook ─────┐                          ┌─ Shopify connector (Admin GraphQL 2026-10, read only)
WooCommerce webhook ─┼─▶ vyron_store_orders ─▶ engine ─┤
Sync Now / import ───┘     (due)                └─ WooCommerce connector (REST wc/v3, read only)
        engine: map products and customer → reconcile VAT and total to the store
              → createCustomerInvoice (the function VOLORA's own invoices use), issued as Posted
              → each refund: credit note (negative lines, credited_invoice_id) against that invoice
```

Every revenue, VAT, GP, customer and product report reads
`vyron_customer_invoices` / `_lines` and counts Posted invoices, so a recorded
store sale appears there like any other sale, and a credit note nets it off.
Invoices are issued as Posted **without a stock movement and without the Xero
queue**, the same way VOLORA's existing invoice import records sales it did not
capture itself.

## 2. What is recorded

| | Sale invoice | Credit note |
|---|---|---|
| Number (unique in the database) | Shopify `SHP-<order id>`; WooCommerce `WC-<order id>-<store tag>` | `SHPR-<refund id>`; `WCR-<refund id>-<store tag>` |
| Source | `source_channel` SHOPIFY / WOOCOMMERCE, `source_reference` `<channel>:<store>:order:<id>` | `…:refund:<id>`, `credited_invoice_id` = the sale |
| Original reference | notes: store order number (#1042) and id; shopper name and e-mail | notes: refund id, order number, store note |
| Lines | products (price, discount, VAT rate as the store charged), shipping, fees | refunded units (cost reversed at the invoiced cost), refunded shipping, any amount the store refunded without itemising it |
| Date | order date in the store's time zone | refund date |

VAT is computed by VOLORA's engine and must agree with the store (one cent per
line, minimum two cents); a 0 % line is recorded zero-rated.

## 3. Mapping

- **Products** (needed for cost of sales and product history): the store's
  product/variant mapped by a person → exact SKU → approved aliases. Never by
  name. An unknown product stops **that order only** as "Product mapping
  required" (source, external product id, SKU, name, order); mapping it once
  retries every waiting order.
- **Customers** never block: a store customer id or e-mail mapped by a person →
  an e-mail belonging to exactly one VOLORA customer → otherwise the store's own
  "online sales" customer, created automatically when the store is connected.
  Never one customer per shopper; the shopper's name and e-mail stay on the
  invoice.

## 4. Statuses

| | Recorded | Waits until paid | Not a sale |
|---|---|---|---|
| Shopify | PAID, PARTIALLY_PAID, PARTIALLY_REFUNDED, REFUNDED | PENDING, AUTHORIZED | VOIDED, EXPIRED, test, cancelled before recording |
| WooCommerce | processing, completed, refunded | pending, on-hold | cancelled before recording, failed, trash, draft |

## 5. Only these stop one order for a person (everything else flows)

| Code | Why it cannot be recorded automatically |
|---|---|
| PRODUCT_UNMAPPED / PRODUCT_AMBIGUOUS | no VOLORA product for the item (cost of sales would be wrong) |
| TAX_MISMATCH / TAX_RATE_MISMATCH / TAX_RATE_UNKNOWN | the store's VAT does not match VOLORA's engine or rate |
| TOTAL_MISMATCH | the store's total includes something its data does not itemise (tip, gift card, duty) |
| CURRENCY_MISMATCH | not ZAR |
| REFUND_VAT_UNDETERMINED | an un-itemised refund amount on an order with more than one VAT rate |
| REFUND_UNRECONCILED / REFUND_TAX_MISMATCH | the credit would not equal what the store refunded |
| ORDER_CHANGED_AFTER_IMPORT / CANCELLED_NOT_REFUNDED | the store changed a sale already recorded; the invoice is never silently altered |

## 6. No duplicates

Webhook delivery id unique per store; one sync row per store order; one refund
row per store refund; invoice numbers unique in the database (a crash-retry
adopts the invoice only when its `source_reference` matches); a processing
lease per order.

## 7. Automatic and manual

- Webhooks (Shopify: orders create/updated/cancelled, refunds create;
  WooCommerce: order created/updated) record the order and process it after the
  response.
- **Sync Now** fetches orders changed since the last sync (first time: 72 hours)
  and processes them — the recovery for anything a webhook missed. The optional
  scheduled run `GET /api/integrations/store-sales/cron` (bearer `CRON_SECRET`)
  does the same hourly and retries failures.
- **Historical import**: date range, 50 orders a page, resumable, pause/resume,
  idempotent, audited.

## 8. Credentials and tenancy

Server environment only (`SHOPIFY_*` / `WOOCOMMERCE_*` single-store variables or
`VYRON_SHOPIFY_CREDENTIALS` / `VYRON_WOOCOMMERCE_CREDENTIALS` JSON), each entry
naming the owning **company id**; activation, API calls and webhooks refuse a
mismatch, so one tenant cannot receive another tenant's store orders.

## 9. Code and database

- `src/lib/store-sales/` (engine `service.ts`, planner `sales.ts`, `shopify/`, `woocommerce/`), webhook routes `/api/integrations/{shopify,woocommerce}/webhooks`, staff routes `/api/integrations/store-sales/*`, screen `/integrations/online-stores`.
- Migration: three nullable columns on `vyron_customer_invoices` (`source_channel`, `source_reference`, `credited_invoice_id`) and six `vyron_store_*` tables (RLS on, no policies, grants revoked). Verified on PGlite with the production invoice DDL.
- Existing code changed (opt-in, existing callers unchanged): `calculateInvoiceTax` `allowCreditLines`; `createCustomerInvoice` `useSuppliedLineValues`, `source`, `creditedInvoiceId`.

## 10. Known limitations

- Store sales do not move VOLORA stock (out of scope).
- `vyron_customers.total_sales` (a cached fallback) is not updated; customer screens and reports read invoices.
- Exempt supplies are not distinguished from zero-rated.
- Shopify orders older than 60 days need `read_all_orders`; shopper e-mail needs Shopify protected-customer-data approval (without it, unmatched shoppers go to the online-sales customer).
