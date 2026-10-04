# Connecting FoodSock's Shopify and WooCommerce stores to VOLORA

Scope: FoodSock's online **sales** and **refunds/credits** flow into VOLORA.
FoodSock changes nothing in how they work. Never send keys or secrets by chat or
e-mail — they are entered directly in the server's environment settings.

## A. VOLORA side, before the meeting

1. Deploy the code and apply migration `20261004120000_vyron_store_sales_sync.sql` (safety process).
2. Check `NEXT_PUBLIC_APP_URL` is VOLORA's public https address.
3. Optional: `CRON_SECRET` + an hourly schedule of `/api/integrations/store-sales/cron` (automatic retries and catch-up). Without it, **Sync Now** does the same on demand.
4. Signed in to FoodSock's company: CUSTOMERS → **Online Store Sales**. Each store card shows the webhook address and the **company id** for the credentials.

| Store | Webhook address |
|---|---|
| Shopify | `https://<VOLORA address>/api/integrations/shopify/webhooks` |
| WooCommerce | `https://<VOLORA address>/api/integrations/woocommerce/webhooks` |

## B. What to obtain from FoodSock

**WooCommerce**
- The store URL (https).
- WordPress access as Administrator or Shop Manager, to create on the call: one REST API key with **Read** permission, and two webhooks.

**Shopify**
- The `<shop>.myshopify.com` domain.
- A staff member with **app development** permission to create an app in Shopify's Dev Dashboard with scope **`read_orders`**, and to request **`read_all_orders`** (needed to import sales older than 60 days, i.e. from 1 January 2026) and protected customer data (name, e-mail).

Nothing else is needed from FoodSock.

## C. Steps on Tuesday

### WooCommerce
1. WooCommerce → Settings → Advanced → REST API → *Add key*: description `VOLORA`, permissions **Read** → copy Consumer Key and Consumer Secret.
2. Choose a long random **webhook secret**.
3. VOLORA administrator, in Vercel environment variables (Production), then redeploy:
   ```
   WOOCOMMERCE_STORE_URL=https://<foodsock woo site>
   WOOCOMMERCE_COMPANY_ID=<company id shown on the card>
   WOOCOMMERCE_CONSUMER_KEY=ck_…
   WOOCOMMERCE_CONSUMER_SECRET=cs_…
   WOOCOMMERCE_WEBHOOK_SECRET=<secret from step 2>
   ```
4. VOLORA → Online Store Sales → WooCommerce → enter the store URL → *Connect WooCommerce* (its online-sales customer is created automatically).
5. *Test Connection* → "Read access confirmed · N orders visible".
6. WooCommerce → Settings → Advanced → Webhooks → *Add webhook*, twice: **Order created** and **Order updated**, status Active, delivery URL = WooCommerce webhook address, secret = step 2, API version WP REST API v3.
7. *Activate*.
8. Test: a small order → it appears as *Imported* (`WC-…`); refund it → credit note `WCR-…`.
9. *Orders & import* → Historical import → From `2026-01-01` → *Start import* (continue with *Import next page now* or let the scheduled run continue it).

### Shopify
1. Dev Dashboard → Apps → *Create app* → `VOLORA` → version with scope `read_orders` (+ `read_all_orders`) → *Release* → *Install* on FoodSock's store → copy Client ID and Client secret.
2. Vercel environment variables, then redeploy:
   ```
   SHOPIFY_STORE_DOMAIN=<foodsock>.myshopify.com
   SHOPIFY_COMPANY_ID=<company id shown on the card>
   SHOPIFY_CLIENT_ID=…
   SHOPIFY_CLIENT_SECRET=…
   ```
3. VOLORA → Shopify → `<foodsock>.myshopify.com` → *Connect Shopify*.
4. *Test Connection* → shop name and ZAR.
5. *Register webhooks* (VOLORA subscribes the order and refund events itself), then *Activate*.
6. Test order and refund (`SHP-…`, `SHPR-…`).
7. Historical import from `2026-01-01`.

### After going live
- **Needs attention**: map each unknown product once; its orders retry automatically.
- **Sync Now** whenever you suspect a missed webhook.
- Compare VOLORA's sales report for a month with the stores' own totals.

## D. Troubleshooting

| Symptom | Fix |
|---|---|
| Credentials *Missing* | variables not set or not redeployed; the URL/domain must match the card exactly |
| *Bound to another company* | `…_COMPANY_ID` must be the id shown on the card |
| HTTP 401/403 on Test | WooCommerce key not Read / revoked; Shopify app not installed or scope missing |
| "did not return JSON" | WooCommerce permalinks set to Plain or a security plugin blocks `/wp-json`; if the host strips auth headers add `WOOCOMMERCE_QUERY_STRING_AUTH=true` |
| WooCommerce webhook *Disabled* | it failed five times (e.g. store not yet connected in VOLORA); set it Active again and press *Sync Now* |
| *Product mapping required* | map the product on the screen |
| *VAT* / *total differs* | a tip, gift card or tax setting the store data does not itemise; record that one sale manually |
| Old Shopify orders "not found" | `read_all_orders` not yet granted |
