# Customer e-mail orders — inbound configuration

Status: **code complete; blocked on external configuration** (mail provider, webhook secret,
mailbox address, and — to be confirmed — the Order Engine migrations in production).

## End-to-end flow (what exists)

1. Customer e-mails an order (CSV / Excel attachment, or PDF) to the company's order address.
2. The mail provider POSTs it to **`/api/order-intake/inbound-email`** (new). The request must be
   authenticated with `VYRON_MAIL_WEBHOOK_SECRET`; anything else gets 401.
3. The tenant is resolved **only** from the address the message was delivered to
   (Order rules → Mailboxes, `vyron_order_mailboxes`). Unknown address → nothing stored.
4. The e-mail channel must be **Active** (Order rules → Channels & activation); otherwise nothing
   is processed.
5. Sender policy, attachment type/size, duplicate attachments and the provider's SPF/DKIM/DMARC
   results are judged. Anything outside policy is **quarantined** for a person.
6. Accepted messages are stored once per Message-ID (a re-delivered e-mail is not processed twice).
   CSV/Excel become order candidates; PDFs are held for extraction (none configured → recorded as
   "not configured", never guessed).
7. Each candidate is matched to the customer and products and validated against the customer's
   price list in the **Order Inbox** (`/order-inbox`). Exceptions and ambiguities are listed there.
8. **A person approves** each order in the Order Inbox. Only an APPROVED intake is handed to Sales
   Orders, through the existing `saveCustomerSalesOrder` (as a Draft; the normal approval rules then
   apply). Nothing is confirmed automatically.
9. Every step is in the intake audit history.

## Required settings

| Setting | Where | Value |
|---|---|---|
| `VYRON_MAIL_WEBHOOK_SECRET` | Vercel → Environment Variables (Production) | A long random secret (32+ characters). Shared only with the mail provider configuration. |
| Order address | Order rules → Mailboxes | The receiving address, e.g. `orders@<client domain>` or a provider inbound address; sender policy (allowed senders/domains) |
| E-mail channel | Order rules → Channels & activation | Move through Configured → UAT → Active per `FOOD_SOCK_ACTIVATION_RUNBOOK.md` |
| DNS / MX | Client's DNS (owner action — not changed by us) | Either forward the order address to the provider's inbound address, or point a sub-domain's MX at the provider |

## Provider options

**Postmark (Inbound stream)** — webhook URL:

```
https://inbound:<VYRON_MAIL_WEBHOOK_SECRET>@www.volora.co.za/api/order-intake/inbound-email?provider=postmark
```

Postmark sends the secret as HTTP Basic auth; VOLORA checks it in constant time. The original
recipient, Message-ID, attachments and SPF/DKIM/DMARC headers are read from Postmark's JSON.

**Any other provider / relay (generic)** — `POST /api/order-intake/inbound-email` with JSON:

```json
{
  "deliveredTo": "orders@client.example",
  "messageId": "<rfc-5322-message-id>",
  "from": "buyer@customer.example",
  "to": ["orders@client.example"],
  "subject": "Order 1234",
  "receivedAt": "2026-11-10T07:00:00Z",
  "text": "plain-text body",
  "attachments": [{ "fileName": "order.xlsx", "contentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "contentBase64": "..." }],
  "verification": { "spf": "pass", "dkim": "pass", "dmarc": "pass" }
}
```

Headers: `X-Volora-Timestamp: <unix seconds>` and
`X-Volora-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>`.
Requests older than 5 minutes are refused (replay protection). Max 25 MB, 20 attachments.

## Production prerequisite to confirm

The Order Inbox needs the `vyron_order_*` tables (five Order Engine migrations, see
`MIGRATION_REVIEW.md`). Whether they are applied to the production database has **not been
measured**. If they are not, the Order Inbox answers NOT_ENABLED and this webhook cannot store
anything. Applying them is a production migration and needs explicit approval.

## Acceptance check

1. Send a signed test message (or a real e-mail through Postmark) to the configured address with
   the e-mail channel in UAT: it appears in the Order Inbox with its attachment parsed.
2. Re-send the same message: it is reported as a duplicate, no second intake.
3. Send from a sender outside the mailbox policy: it is quarantined.
4. Approve the intake: a Draft sales order is created at the customer's price-list prices.
