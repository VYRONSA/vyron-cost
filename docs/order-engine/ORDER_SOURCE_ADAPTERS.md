# Order Engine — Order Sources and Adapters

Status labels as in `VALIDATION_RULES.md`. Code: `src/lib/order-engine/adapters/`,
`sources.ts`, `email-intake.ts`.

## 1. The abstraction — IMPLEMENTED

```ts
interface OrderSourceAdapter<Raw> {
  readonly source: OrderSource;     // manual | csv | xlsx | email | pdf | woocommerce | shopify | api | edi
  readonly connected: boolean;      // false for every external platform
  normalize(raw: Raw): OrderCandidate;
}
```

An adapter only **translates**: receive → parse → normalise into one
`OrderCandidate` (header, source key, supplied amounts, lines with raw SKU /
description / quantity / price / discount / tax / line total / line reference,
optional extraction metadata). It never matches, prices or decides — the
engine does that for every source the same way.

## 2. Source states — shown honestly in the UI

| Source | State | What exists |
|---|---|---|
| Manual entry | **READY** | form; idempotency key per draft |
| CSV file | **READY** | strict parser; content-hash source key |
| E-mail | **NOT CONNECTED** | inbound boundary, envelope storage, CSV attachments → orders; tested. No mailbox or provider |
| WooCommerce | **NOT CONNECTED** | converter tested against WooCommerce REST v3 `order` payloads. No store, no credentials |
| Shopify | **NOT CONNECTED** | converter tested against Shopify Admin REST `order` payloads. No store, no credentials |
| Excel | COMING SOON | see §4 |
| PDF | COMING SOON | DESIGNED (§6) |
| API | COMING SOON | DESIGNED: tenant API key + `Idempotency-Key` → the same receive service |
| EDI | COMING SOON | DESIGNED: mapped onto the same candidate |

## 3. CSV — IMPLEMENTED, TESTED

- One order per file. Required: `quantity` and `sku` or `description`.
  Optional: `customer`, `po_number`, `requested_delivery_date` (YYYY-MM-DD),
  `order_number`, `order_date`, `currency`, `notes`, `unit_price`, `discount`,
  `line_total`, `unit`, `line_ref`. Header aliases are fixed; unknown columns are
  ignored, never guessed at.
- **Whole-file or nothing**: any unreadable row, contradicting header value
  (two customers / POs / order numbers), non-ISO date, empty file or file over
  2 MB refuses the entire file with the row number. Nothing partial is ever
  stored.
- Formula injection neutralised (even behind leading spaces); UTF-8, BOM, CRLF,
  comma and semicolon delimiters, quoted fields.
- Source key = SHA-256 of the content: the same file twice (even renamed) is
  the same order; a different tenant uploading it gets its own order.

Tested: `test:order-engine-controls` (CSV hardening, 25+ cases), fixtures,
concurrency (simultaneous uploads → one order).

## 4. Excel — COMING SOON (deliberately)

The repository's spreadsheet library (`xlsx` 0.18.5 from npm) has published
security advisories for parsing untrusted files. Parsing customer-supplied
.xlsx on the server should wait for a maintained parser. Until then the UI asks
for "Save as CSV". The tabular mapper is shared, so enabling Excel is a parser
change only.

## 5. E-mail — boundary IMPLEMENTED, TESTED; ingestion NOT CONNECTED

```
provider webhook (future) ──▶ receiveInboundEmail(company, message)
                                ├─ store envelope once   (company, channel, message id) unique
                                ├─ CSV attachment(s)     → one order each (key "<message id>#<file>")
                                ├─ no readable order     → NO_ORDER_FOUND (kept for a person)
                                └─ unreadable CSV        → FAILED with reason
```

`InboundEmailMessage`: provider, message id, sender, recipients, cc, subject,
received at, body text, attachment references (file name, type, size,
sha-256, storage path). Attachment **bytes are never stored in the row**.
Customer rung: sender e-mail may identify the customer, always with a review
warning.

**Before connecting a provider (DESIGNED):** verify the provider's signature;
resolve the company from the receiving address, never from the payload; store
attachments in the private `vyron-documents` bucket; rate-limit per sender;
keep bodies only as long as needed.

## 6. AI / document extraction — contract IMPLEMENTED, provider DESIGNED

No live AI provider is called by the Order Engine. The contract is in place so
an extractor can be added without weakening any control:

```ts
type ExtractionMeta = {
  method?: "structured" | "manual" | "rule" | "ai" | "ocr";
  fields?: Record<string, { confidence: "HIGH" | "MEDIUM" | "LOW"; method; source?: string /* "email body line 4" */ }>;
};
```

Stored on the order and each line (`extraction` jsonb). Rules, enforced by the
extraction validator:

1. AI / OCR output is **always** reviewed (`EXTRACTION_REVIEW` warning), even
   when every field is HIGH confidence.
2. Any LOW-confidence field **blocks** approval (`EXTRACTION_LOW_CONFIDENCE`)
   and says where it was read from.
3. AI never sets a match, a customer, a price or a status: extracted SKUs and
   names go through the same deterministic ladders; AI confidence is never
   business approval.
4. Future provider: reuse the existing OpenAI Responses + strict JSON-schema
   pattern (`document-intelligence-v2`), metered by `AiUsageService`, with
   availability handled by `classifyAiProviderFailure`; accuracy measured
   against labelled orders, not the model's self-reported confidence.

Tested: `test:order-engine-controls` (extraction contract).

## 7. WooCommerce mapping — IMPLEMENTED (NOT CONNECTED), TESTED

| WooCommerce | VYRON | Note |
|---|---|---|
| store (configured) + `id` | `source_key` = `<store>:order:<id>` | two stores can share ids |
| `number` | external order number | |
| `status` | `source_status`; `cancelled`, `refunded`, `failed`, `trash`, `checkout-draft` **refused** | |
| `customer_id` (or billing e-mail for guests) | `customer_reference` — never creates or merges a customer | remembered via the identity map |
| `billing.company` / names | customer name as received | |
| line `id` | line reference | |
| line `sku`, `name`, `quantity` | raw line | matched deterministically |
| line `subtotal ÷ quantity` | unit price (pre-discount) | `price` is post-discount — using it would count the discount twice |
| line `subtotal − total` | line discount (includes coupon allocations) | coupon codes recorded, not re-applied |
| line `total`, `total_tax` | stated line total, line tax | |
| `prices_include_tax` | recorded; **true blocks** until prices are confirmed ex-tax | |
| `shipping_total` / `shipping_lines` | recorded; warning — not carried to the sales order | |
| `refunds[]` | recorded as a fact; warning | never netted |
| `total`, `total_tax`, `discount_total`, `currency`, `date_created` | stated totals, currency, order date | |

## 8. Shopify mapping — IMPLEMENTED (NOT CONNECTED), TESTED

| Shopify | VYRON | Note |
|---|---|---|
| store + `id` | `source_key` | |
| `name` (e.g. `#1042`) | external order number | |
| `cancelled_at` set, `financial_status` refunded / voided | **refused** | |
| `financial_status` | `source_status` | partially_refunded recorded |
| `customer.id` (or e-mail) | `customer_reference` | |
| line `id`, `sku`, `name`/`title`, `quantity`, `price` | raw line | `price` is pre-discount |
| line `discount_allocations[]` (fallback `total_discount`) | line discount | |
| line `tax_lines[]` | line tax | |
| `taxes_included` | recorded; **true blocks** | |
| `total_shipping_price_set` / `shipping_lines` | recorded; warning | |
| `discount_codes`, `refunds[].transactions` | recorded | |

## 9. What cannot be mapped without client confirmation

| Question | Why it matters |
|---|---|
| Which store identifier to use per shop, and whether the two Food Sock stores share product and customer numbering | the source key and identity map are per store |
| Whether web-store orders should become operational orders at all, or only historical sales | historical sales belong to the separate external-sales design and must never become invoices |
| VAT basis per store | tax-inclusive prices block until converted |
| How shipping is billed | shipping is not carried to the sales order |
| Order statuses that mean "ready to fulfil" | today only cancelled/refunded/failed are refused |
| Customer identity rules (guest checkouts, B2B accounts) | references are remembered per decision; nothing is merged |
