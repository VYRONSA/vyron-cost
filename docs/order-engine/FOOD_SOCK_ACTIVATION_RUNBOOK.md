# Food Sock — ordering activation runbook

How the Food Sock ordering integration goes live, in stages, once Food Sock
supplies the decisions and credentials listed at the end. Nothing in this
document has been done: no production database has been touched, no mailbox,
extractor or web store is connected, and no migration has been applied.

The stages are deliberately separate. Each one ends in a state you can stop at
for as long as you like, and each channel (entered by hand, CSV, Excel,
e-mail, PDF, web store) goes through them on its own. **A channel never becomes
active because its credentials exist.** Activation is a decision a named person
takes in *Order Inbox → Order rules → Channels & activation*, and the engine
re-checks that channel's conditions at the moment it is taken.

States, in order:

| State | Meaning |
|---|---|
| Disabled | Nothing enters through this channel. The starting state of every external channel. |
| Configured | The settings it needs exist. Still nothing enters. |
| Ready for UAT | Configuration complete; ready to be tested outside production. |
| UAT passed | Testing passed, recorded with the evidence that proves it. |
| Ready for activation | Every condition met; waiting for the business to say go. |
| Active | Real orders enter through it. Recorded against the person who activated it. |
| Suspended | Stopped with a reason, without losing its configuration or history. |

Entering orders by hand, and uploading a CSV or Excel file, need no connector,
provider or credential: a person is already signed in and doing it. Those three
are active unless a tenant switches them off. E-mail, PDF and web store start
Disabled.

---

## Stage 0 — Engineering (done)

| Condition | State |
|---|---|
| The branch has been reviewed | `feat/order-engine-foundation`, this commit |
| The tests pass | see `FOOD_SOCK_PRODUCTION_READINESS.md` for the current gate and counts |
| The migrations have been reviewed | `MIGRATION_REVIEW.md` — five migrations, none applied |
| Nothing in production has been touched | no production database, mailbox, store or extractor has been contacted by this work |

Exit condition: an engineer confirms the gate passed on the commit that will be
deployed.

## Stage 1 — Tenant configuration

Nothing here connects anything. It is Food Sock stating its own rules.

1. **Identify the tenant.** The Food Sock workspace and its company id, from the
   live system. There is no Food Sock company id anywhere in the code, and
   there must not be one.
2. **Configure D1–D12** in *Order rules*. Each is listed in
   `FOOD_SOCK_OPEN_DECISIONS.md` with what happens until it is decided. An
   undecided decision stops the affected order; it never becomes a default.
   The screen shows each decision as configured or awaiting.
3. **Retailer and customer rules** (D5): per customer — PO required, delivery
   date required, delivery days, minimum order, whole cases, minimum margin.
   Only the ones Food Sock states.

Exit condition: the decision register shows no blocking decision outstanding
for the channels about to be activated.

## Stage 2 — Non-production catalogue and UAT

1. **Obtain a catalogue snapshot** — products, stock, BOMs and BOM lines, and
   optionally customers, price lists and policies. Export only; no write.
2. **Load it into an isolated environment** (`npm run uat:food-sock -- --snapshot <file>`).
   The run is labelled SNAPSHOT / NON-PRODUCTION and never reaches production.
3. **Run the UAT pack** — `FOOD_SOCK_UAT_PACK.md`, every scenario, including the
   channel paths. All 14+ scenarios must behave as the pack says.

Exit condition: the pack passes on Food Sock's own catalogue, and the run
reference is recorded against each channel when its testing is marked passed.

## Stage 3 — Migration

The five Order Engine migrations must be applied to the production database
before anything can be activated.

1. **Generate the exact plan**: the five files, in order, unchanged.
2. **Family P approval**: a production data operation under the repository's
   safety process — written approval from a named person before it runs.
3. **Verify the database identity**: the project ref the deployed application
   actually uses, not the one a dashboard badge suggests.
4. **Verify the expected database**: the migration tool must state which
   database it is about to change, and a person must confirm it is the intended
   one.
5. **Acknowledgement**: the operator records that they have read the plan.
6. **Verify the plan hash**: the hash of the files approved must equal the hash
   of the files applied. A different hash stops the operation.

Exit condition: the five migrations are applied, and re-running the PG test on a
disposable database still passes.

## Stage 4 — Mailbox (e-mail channel)

Nothing below may be invented by engineering.

| Condition | Who supplies it |
|---|---|
| The receiving address | Food Sock |
| The provider (which mail service delivers it) | Food Sock |
| Authentication: the provider's webhook secret | Food Sock / their provider, into the deployment environment as `VYRON_MAIL_WEBHOOK_SECRET` |
| Sender / domain policy: who may send orders here | Food Sock |
| Attachment policy: types and size | Food Sock (engine limits apply otherwise: CSV, Excel, PDF, 10 MB) |
| SPF / DKIM / DMARC | taken from the provider's own results where it supplies them; VOLORA never asserts them itself |
| A test message | sent to the address once configured, before activation |

The address decides which tenant an inbound message belongs to, so it is
globally unique: no two workspaces can claim the same one. A message to an
unknown or disabled address is not stored at all.

**Credentials are never stored in the repository.** There is no credential
file. The deployment environment supplies the secret; the product only reports
whether it is present.

Exit condition: *Channels & activation* shows every e-mail condition met, the
test message arrived and was judged correctly, and testing is recorded as
passed.

## Stage 5 — PDF extraction

| Condition | Who supplies it |
|---|---|
| Which extractor | Food Sock (commercial decision, D12) |
| Its credential | into the deployment environment as `VYRON_PDF_EXTRACTOR_KEY` |
| Extraction test | a fictional order PDF must come back as a canonical extraction |
| Confidence test | every field must carry a confidence; a response without one is refused |
| Page-reference test | page references are kept where the provider supplies them, and never invented |

No provider is registered in this build, and none should be connected before
this stage. Until one is, a PDF is accepted, held as "document not read yet",
and recorded as a NOT_CONFIGURED extraction attempt — nothing about the order
is guessed. A low-confidence value blocks approval.

Exit condition: the extraction, confidence and page-reference tests pass on
fictional documents, and testing is recorded as passed.

## Stage 6 — Web store (only if D1 = fulfil)

**Skip this stage entirely unless Food Sock has decided that web-store orders
are to be fulfilled in VOLORA.** If D1 is "history only" — or undecided — the
web-store channel stays Disabled, and historical Metorik / WooCommerce data
stays outside the transactional Sales Order pathway, where it is today.

If D1 is fulfil:

| Condition | Who supplies it |
|---|---|
| Store identity (which store, its channel key and label) | Food Sock |
| Credentials | into the deployment environment as `VYRON_WEB_STORE_CREDENTIALS` |
| Source → VOLORA product mappings (D9) | Food Sock, or "store SKUs are VOLORA SKUs" |
| Customer mapping (D2) | Food Sock — one web account, or per-customer |
| Which statuses mean ready to fulfil (D10) | Food Sock |
| VAT basis: do store prices include VAT (D3) | Food Sock, per store |
| Shipping treatment (D4) | Food Sock |
| Refund treatment | Food Sock — never netted, credit note, or reject the order |
| A test order | drawn from the store into the isolated environment, not production |

Exit condition: a test order maps to the right customer, the right products and
the right VAT basis, with no invented values.

## Stage 7 — Controlled live activation

1. **One channel at a time.** Activate the channel Food Sock most needs, watch
   it, and only then consider the next. Channels are independent: a broken one
   never disables another.
2. **Watch it.** *Order Inbox* shows every order with its channel, source,
   customer, reference, when it arrived, how it was read, its validation and
   exception state, its approval state and whose desk it is on. *Channels &
   activation* shows each channel's last success, last failure and open
   exception count.
3. **The first orders are approved by a person.** The first live order from a
   newly activated channel is raised as "First live order from this channel",
   which an approver must acknowledge by name before it can be approved. As
   with every order, approval creates a **Draft** sales order and nothing else:
   no invoice, no Xero posting, no manufacture, no stock movement.
4. **Rollback.** Suspend the channel, with a reason, in *Channels &
   activation*. Orders already received keep their history; nothing new comes
   in. Disabling it clears the activation record so it must go through
   activation again. Neither loses configuration, and neither touches orders
   that already exist.

---

## Food Sock activation inputs required

These cannot be derived from the code, the catalogue or this work. Engineering
must not invent them, and none of them is needed before Stage 1.

**Business decisions**

1. **D1** — are web-store orders fulfilled in VOLORA, or historical sales only?
2. **D2** — how are B2C web orders booked: one web-store account, or per customer?
3. **D3** — do store prices include VAT (per store)?
4. **D4** — how is shipping billed?
5. **D5** — per retail customer: PO, delivery date, delivery days, minimum order, whole cases, minimum margin.
6. **D6** — a repeated customer PO: warn, or block?
7. **D7** — may a line without a SKU match on an exact product name?
8. **D8** — minimum lead time between order and delivery?
9. **D9** — do retailer / store SKUs equal VOLORA SKUs? If not, the mapping.
10. **D10** — which web-store statuses mean "ready to fulfil"?
11. **D11** — who approves, and may the person who entered an order approve it?
12. **D12** — which inbox carries B2B orders, and which extractor reads PDFs?
13. **Refunds** — a refunded or partly refunded web order: never netted, credit note, or reject?

**Integration inputs**

14. The **receiving e-mail address** for orders, and its **provider**.
15. The provider's **webhook secret** (into the environment, not into a file).
16. The **sender / domain policy**: who is allowed to send orders to it.
17. The **PDF extractor** to use, and its **credential** (into the environment).
18. If D1 = fulfil: the **web store's identity and credentials**, and its
    product and customer mappings.
19. **Retailer-specific rules** that are not covered by D5.

**Named people**

20. Who approves the production migration (Stage 3), and who activates each
    channel (Stage 7).
