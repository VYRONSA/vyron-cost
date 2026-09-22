# Order Engine — Demo Script (Tuesday)

Audience: a food manufacturer's owner or operations lead. Duration: 15–20
minutes. Everything shown uses the **fictional** company *Harbour Kitchen
Foods* — no client data.

## The story

> A customer sends an order. VYRON receives it, understands it, checks the
> customer, the products, the price and the stock, works out whether
> production is needed, flags anything unusual, and sends it for approval.
> The manager approves, VYRON creates the sales order, and the existing
> fulfilment and invoicing process takes over.

## Two ways to run it

| | A. Scripted demo (ready now) | B. Live screens |
|---|---|---|
| What | `npm run demo:order-engine` — the whole story in the terminal, driven by the real engines | the Order Inbox screens with the demo data |
| Needs | nothing: in memory, no database, no network | a **non-production** database with both Order Engine migrations applied and the demo data loaded — a human decision (§5) |
| Risk | none | none to production if §5 is followed |
| Screenshots | — | `docs/order-engine/screenshots/` (captured from the real components with real API responses) |

Recommendation: rehearse with A; show B from the screenshots unless a staging
environment has been approved before Tuesday.

## 1. Before the demo (5 minutes)

1. `git checkout feat/order-engine-foundation && npm install`
2. `npm run demo:order-engine` — confirm it ends with "End of demonstration."
3. Open the screenshots folder in order (01 → 10).

## 2. Walkthrough — scripted demo (A)

| Step | Say | Show (terminal section) |
|---|---|---|
| 1 | "Northside Grocers e-mails their order — a CSV from their buying system." | *A customer sends an order* |
| 2 | "VYRON stores the e-mail once. If the mail server delivers it twice, nothing is duplicated." | *VYRON receives it* — duplicate=true |
| 3 | "It identifies the customer by exact name, and every product by exact SKU — no guessing. Beef pies get Northside's contract price." | *VYRON understands it* — rules per line |
| 4 | "Stock is on-hand minus what other live orders already hold. 60 chicken pies on hand, 40 promised elsewhere — only 20 free; the rest can be produced because a BOM exists." | same section |
| 5 | "One line uses Northside's own code. VYRON will not guess — it raises an exception." | *VYRON identifies exceptions* |
| 6 | "The order desk chooses the right product, and the manager tells VYRON to remember Northside's code." | *A person resolves the exception* |
| 7 | "Warnings don't block, but the manager must acknowledge them — the price difference and the stock shortfall." | *…manager reviews and approves* |
| 8 | "VYRON hands the order to the existing Sales Orders engine as a Draft. Nothing is reserved, invoiced or sent to Xero by approval." | *…hands the order to the EXISTING engine* — counts all 0 |
| 9 | "From here it is the workflow they already know. The engine refuses to reserve stock it doesn't have — production first — then picks, packs, dispatches and invoices. Xero still only happens when someone posts the invoice." | *The existing fulfilment workflow takes over* |
| 10 | "Every step is recorded with who did it." | *The order's own story* |
| 11 | "Next week, Northside's code is recognised automatically — for Northside only." | *Next time…* |

## 3. Walkthrough — screens (B or screenshots)

| # | Screenshot | Point to make |
|---|---|---|
| 01 | `01-inbox.png` | Orders from manual entry, CSV, WooCommerce, Shopify in one inbox; blocking vs warning counts; honest source states (Ready / Not connected / Coming soon) |
| 02 | `02-detail-awaiting-approval-approver.png` | As received vs as matched; stock net of other orders; production needed; margin for the manager; the acknowledgement box on Approve |
| 03 | `04-detail-low-margin-clerk.png` | The same kind of order seen by an order-desk clerk: cost and margin hidden, no approve button |
| 04 | `05-detail-exceptions-clerk.png` | Several blocking problems at once, each with the action to take; ambiguous SKU offers the two candidates |
| 05 | `06-detail-confirmed.png` | Confirmed: the linked Draft sales order and the timeline from receipt to sales order |
| 06 | `09-exception-centre.png` | Every open problem across orders: what, why, where, what to do; recent resolutions with who and when |
| 07 | `10-rules.png` | Optional customer ordering rules (all off unless switched on) and remembered codes, revocable |

## 4. Questions to expect

| Question | Answer |
|---|---|
| "Does it guess products?" | No. Exact identifiers only; anything else is an exception a person resolves, optionally remembered for that customer. |
| "Can two people approve the same order?" | No — the second is told the order changed. Proven with simultaneous requests. |
| "What if stock changes after I looked?" | Approval re-checks and refuses; you see the new picture and approve again. |
| "Is our web shop connected?" | Not yet. The converters exist and are tested; connecting needs your store details and a decision on which orders flow in. |
| "Does it read e-mails and PDFs?" | E-mailed CSVs, yes (once a mailbox is connected). PDFs and free-text e-mails are designed with AI assistance that is always reviewed — not built. |
| "Does it post to Xero?" | Only through the existing invoice posting step, as today. |

## 5. Enabling the live screens (human decisions)

1. Choose a **non-production** Supabase project (not `pnb…`, the production
   database). Confirm the choice in writing.
2. Apply `supabase/migrations/20260922120000_vyron_order_intake.sql` then
   `20260922130000_vyron_order_intake_hardening.sql` there.
3. Create a demo workspace and load the fictional data from
   `src/lib/order-engine/demo/fixtures.ts` (`demoSeed()`); column names must be
   checked against that database's schema first — the repository's schema file
   is not authoritative.
4. Deploy the branch to that environment only (a Vercel preview is not safe if
   it uses production environment variables).
