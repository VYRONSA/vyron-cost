# Food Sock — what we need from you

Everything below is a decision or a credential only Food Sock can give. None of
it is guessed, defaulted or filled in by us: until an answer arrives, the
system stops the affected order and says why.

Nothing here has been sent to Food Sock. It is a list for whoever holds the
conversation.

The order of work these feed into is `FOOD_SOCK_ACTIVATION_RUNBOOK.md`; what
each answer changes is in `FOOD_SOCK_OPEN_DECISIONS.md`.

---

## 1. Ordering decisions (D1–D12)

| # | Question | What happens until it is answered |
|---|---|---|
| D1 | Are web-store orders (WooCommerce / Shopify) **orders to fulfil** in VOLORA, or historical sales only? | Web orders are held; none becomes a sales order. |
| D2 | How are **B2C web orders booked** — one "web store" customer account, or an account per customer? | A web order from an unknown customer stops for a person. |
| D3 | Do **store prices include VAT**, per store? | A tax-inclusive order stops until someone enters ex-tax prices. |
| D4 | How is **shipping** billed — never carried, a separate line, or absorbed? | Shipping is shown but not added to the sales order. |
| D5 | Per retail customer: **PO required? delivery date required? delivery days? minimum order? whole cases? minimum margin?** (SPAR, Pick n Pay, and any others) | No rule is applied to that customer. |
| D6 | A **repeated customer PO**: warn the approver, or block the order? | Warn; the approver acknowledges it. |
| D7 | May a line **with no SKU** match on an exact product name? | Allowed, and always raised for review. |
| D8 | Minimum **lead time** between order and delivery? | Not checked. |
| D9 | Do retailer / store **SKUs equal VOLORA SKUs**? If not, which codes map to which products? | Unmatched lines stop. Nothing is ever guessed. |
| D10 | Which **web-store statuses** mean "ready to fulfil"? | Cancelled, refunded, failed and draft are refused; the rest are received. |
| D11 | **Who approves** orders, and may the person who entered one approve it? | Any member with approve permission. |
| D12 | Which **inbox** carries B2B orders, and which **document extractor** reads PDFs? | No e-mail is received; PDFs are held as "not read yet". |
| — | A **refunded or partly refunded** web order: never netted, a credit note, or reject the order? | The refund is recorded and raised as a warning; nothing is netted. |

## 2. Retailer and customer rules

For each retail customer that has its own rules (D5), we need them in writing:
purchase-order requirement, delivery-date requirement, delivery days, minimum
order value, whole-case ordering, minimum margin, and any standing delivery
instruction. A customer without rules is not blocked — no rule is simply
applied to it.

## 3. E-mail

| Item | Why it is needed |
|---|---|
| The **receiving address** for orders (for example orders@…) | The address decides which workspace an inbound message belongs to. It must be used for nothing else, and is globally unique. |
| The **provider** that delivers it (Microsoft 365, Google Workspace, a mail relay) | It supplies the webhook and the authentication results. |
| The provider's **webhook secret** | Verifies that a message really came from the provider. Given to whoever deploys, straight into the environment — never in a document, an e-mail or the codebase. |
| The **sender policy**: which addresses or domains may send orders there | Anything outside it is held for a person instead of processed. |
| The **attachment policy** (optional) | Types and size limit. Without one, the engine's own limits apply: CSV, Excel and PDF, up to 10 MB. |

## 4. PDF documents

| Item | Why it is needed |
|---|---|
| Which **document extractor** to use | A commercial choice, with a cost per document. Nothing is connected today. |
| Its **credential** | Into the deployment environment, as above. |
| Whether a **person checks every extracted order** at first | Our recommendation: yes, for the first weeks. An uncertain value already blocks approval. |

## 5. Web store (only if D1 = fulfil)

| Item | Why it is needed |
|---|---|
| Which **store** (platform, URL, name) | It is identified per store, and activated per store. |
| Its **credentials** | Into the deployment environment. |
| **Product mappings** (D9) or confirmation that store SKUs are VOLORA SKUs | An unmatched line stops. |
| **Customer treatment** (D2) | Whether web sales are booked to one account or per customer. |
| **Statuses** that mean ready to fulfil (D10), the **VAT basis** (D3), **shipping** (D4) and **refund** treatment | Each of these changes what the sales order says. |

Historical Metorik / WooCommerce sales stay where they are: they are not turned
into sales orders or invoices, whatever D1 says.

## 6. People

| Item | Why it is needed |
|---|---|
| Who **approves the production migration** | It is a change to the live database, under our controlled-operation process. |
| Who **activates each channel**, and when | Activation is recorded against that person, by name. |
| Who **approves orders** day to day (D11) | The first order through each new channel must be acknowledged by an approver by name. |

## 7. For UAT (before any of the above goes live)

A **catalogue snapshot** from a non-production copy: products, SKUs, active or
discontinued, cost, stock, BOMs and components, and — if available — customers,
customer pricing, ordering rules, pack sizes and any item-code mappings. The
format is in `FOOD_SOCK_CATALOGUE_SNAPSHOT.md`.

It must come from a restore or a non-production environment, not from the live
database, and the file has to say so: the UAT runner refuses a snapshot that is
not classified `NON-PRODUCTION / UAT`, and refuses one whose stated environment
looks like production.

Orders, customers and prices used in the UAT scenarios stay fictional either
way. No real order and no personal information is needed from Food Sock to run
UAT.
