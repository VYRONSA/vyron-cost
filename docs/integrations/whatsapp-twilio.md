# WhatsApp notifications (Twilio) — configuration

Status: **code complete; blocked on external credentials and WhatsApp sender approval.**
Nothing is simulated. Until the variables below are set, the WhatsApp channel shows
**Not configured** (with the missing variable names) on Order Centre → Notifications, and every
WhatsApp delivery is recorded as `Not Configured` — never as sent.

## What VOLORA does

- Sends order notifications to staff recipients who have WhatsApp switched on and a mobile number
  (Order Centre → Notifications). Numbers are normalised to E.164 (+27…).
- Uses Twilio's REST API directly (no SDK). Credentials are read from server environment variables
  only; they are never stored in the database, returned to the browser, or logged.
- **Sent** means Twilio accepted the message. **Delivered** / **Failed** are set only from Twilio's
  signed status callback (`POST /api/integrations/twilio/status`), which checks
  `X-Twilio-Signature` with the auth token and ignores unsigned requests.
- A test message per recipient and channel can be sent from the Notifications screen; it shows
  Twilio's actual answer.

## Required settings (Vercel → Project → Settings → Environment Variables, Production)

| Variable | Required | Value |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Console → Account Info → Account SID (`AC…`) |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Console → Account Info → Auth Token (secret) |
| `TWILIO_WHATSAPP_FROM` | Yes | The approved WhatsApp sender number, e.g. `+27…` (or `whatsapp:+27…`) |
| `TWILIO_WHATSAPP_TEMPLATE_SID` | Strongly recommended | Content SID (`HX…`) of an approved WhatsApp template. Without it, WhatsApp only allows free-form messages within 24 hours of the recipient last messaging the sender, so most notifications would be refused. |
| `NEXT_PUBLIC_APP_URL` | For delivery reports | Already used by the app: the public https address (e.g. `https://www.volora.co.za`). When it is https, each message asks Twilio to report delivery to `/api/integrations/twilio/status`. |

SMS uses the same account plus `TWILIO_FROM_NUMBER`.

After changing variables, redeploy so the new values are loaded.

## External steps (Twilio / Meta) — owner action

1. Twilio account upgraded from trial (trial accounts can only message verified numbers).
2. WhatsApp sender registered in Twilio (Messaging → Senders → WhatsApp senders), linked to the
   business's Meta Business Manager, display name approved by Meta, and the number verified.
3. A message template for order notifications created and approved in Twilio Content Template
   Builder; its Content SID goes in `TWILIO_WHATSAPP_TEMPLATE_SID`. VOLORA fills the template
   variables as: `{{1}}` business name, `{{2}}` order number, `{{3}}` customer, `{{4}}` requested
   delivery date, `{{5}}` item count, `{{6}}` order total, `{{7}}` link to the order. The approved
   template must use these seven variables in this order.
4. No webhook needs to be configured in the Twilio console for delivery reports — VOLORA sends the
   callback URL with each message.

## Acceptance check once configured

1. Order Centre → Notifications: WhatsApp shows **Configured**, the sender, and "Delivery reports are on".
2. Add a staff recipient with a real mobile and WhatsApp on; press **Test WhatsApp**: result **Sent**.
3. Within a minute the delivery log for that test shows **Delivered** (from Twilio's callback). If it
   shows **Failed**, the error carries Twilio's error code (e.g. 63016 = outside the 24-hour window
   without an approved template).
