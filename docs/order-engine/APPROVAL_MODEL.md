# Order Engine — Approval Model

Status labels as in `VALIDATION_RULES.md`. Code: `src/lib/order-engine/lifecycle.ts`,
`service.ts`, routes under `src/app/api/order-intake/`.

## 1. States — IMPLEMENTED, TESTED

| Order status | Meaning | Editable |
|---|---|---|
| `RECEIVED` | Received (or returned for changes); not yet validated | yes |
| `EXCEPTION` | Validated; at least one **blocking** issue | yes |
| `AWAITING_APPROVAL` | Validated; no blocking issues (warnings allowed) | no |
| `ON_HOLD` | An approver paused it, with a reason | no |
| `APPROVED` | Approved; the sales order is being (or failed to be) created | no |
| `CONFIRMED` | A Draft sales order exists and is linked — terminal for the intake | no |
| `REJECTED` | Rejected with a reason — terminal | no |
| `CANCELLED` | Cancelled with a reason — terminal | no |

Approval, fulfilment and invoice status are **separate dimensions**: approval is
derived from the order status; fulfilment and invoice come from the linked
sales order and are never stored twice.

## 2. Actions — IMPLEMENTED, TESTED

| Action | From | To | Permission | Reason | Notes |
|---|---|---|---|---|---|
| receive | — | RECEIVED | `sales_orders.create` | — | idempotent per source key |
| edit / resolve | RECEIVED, EXCEPTION | RECEIVED | `sales_orders.edit` | — | "remember" needs `sales_orders.approve` |
| validate | RECEIVED, EXCEPTION | AWAITING_APPROVAL / EXCEPTION | `sales_orders.create` | — | |
| approve | AWAITING_APPROVAL | APPROVED → CONFIRMED | `sales_orders.approve` | optional note | re-validates; stated validation hash must match; warnings must be acknowledged |
| confirm (retry) | APPROVED | CONFIRMED | `sales_orders.approve` | — | idempotent |
| hold | AWAITING_APPROVAL | ON_HOLD | `sales_orders.approve` | required | |
| release | ON_HOLD | AWAITING_APPROVAL / EXCEPTION | `sales_orders.approve` | — | re-validates |
| request changes | AWAITING_APPROVAL, ON_HOLD | RECEIVED | `sales_orders.approve` | required | clears the validation |
| reject | AWAITING_APPROVAL, ON_HOLD, EXCEPTION | REJECTED | `sales_orders.approve` | required | |
| cancel | RECEIVED, EXCEPTION, AWAITING_APPROVAL, ON_HOLD | CANCELLED | `sales_orders.edit` | required | |

Every action: server-side permission check from the verified session →
company from the session → state check → compare-and-set → audit event →
(optional) notification → telemetry. Errors are typed (`OrderEngineError`:
400 invalid input, 404 not found, 409 invalid transition / conflict / warnings
not acknowledged / validation failed, 413, 415, 502 handoff failed, 503 not
enabled).

## 3. Permissions — IMPLEMENTED, TESTED

The brief's permission concepts map onto **existing** VYRON keys; no new
permission was created (creating one would also require every role default and
the admin screen to change).

| Brief concept | VYRON key | Default holders (existing RBAC) |
|---|---|---|
| order.view | `sales_orders.view` | every role |
| order.create | `sales_orders.create` | OWNER, ADMIN, SALES |
| order.edit, order.resolve_exception | `sales_orders.edit` | OWNER, ADMIN, SALES |
| order.validate | `sales_orders.create` | OWNER, ADMIN, SALES |
| order.approve, order.reject, order.hold, remember a mapping, ordering rules | `sales_orders.approve` | OWNER, ADMIN, SUPERVISOR, MANAGER, SALES |
| order.cancel | `sales_orders.edit` | OWNER, ADMIN, SALES |
| see cost and margin | `sales_orders.approve` | as above (same rule as the Order Centre) |

"STAFF" is not a VYRON role; the nearest are `USER` and `VIEW_ONLY` (view only).
Custom per-member permissions set in the admin screen apply as usual.

Tested by `test:order-engine-permissions`: 10 roles × 19 endpoints and actions
plus anonymous (226 checks), with fixed spot checks.

**Separation of duties** (the person who received an order may not approve it)
is **DESIGNED, not enforced**: existing RBAC does not model it, and SALES holds
both create and approve by default. Enforcing it is a policy decision for each
client.

## 4. Concurrency — IMPLEMENTED, TESTED

- **Compare-and-set** on `(id, company_id, status, version)` for every state
  change; a stale writer gets 409 and changes nothing. Proven on real Postgres
  with two connections (exactly one row updated).
- **Validation hash**: approval must name the validation the approver saw; the
  server re-validates and refuses if anything changed (stock, price list,
  reservations, customer status, policy), storing the fresh validation for
  review.
- **Pre-claimed sales-order id**: a retried or concurrent handoff finds or
  collides with the same id — never a second sales order.

Tested by `test:order-engine-concurrency` (45 checks, 16 scenarios) and the
Postgres suite.

## 5. Audit — IMPLEMENTED, TESTED

`vyron_order_intake_events`: append-only (the database refuses update and
delete), one row per event, actor = the verified member's id plus display name,
from/to status, detail, metadata. Events:

`RECEIVED`, `RECEIVE_DUPLICATE`, `VALIDATED` (with customer rule and matching
summary), `EXCEPTION_RAISED`, `APPROVAL_REQUESTED`, `EDITED`, `LINE_RESOLVED`,
`CUSTOMER_RESOLVED`, `APPROVAL_REVALIDATION_CHANGED`, `HELD`, `RELEASED`,
`CHANGES_REQUESTED`, `APPROVED` (with acknowledged warnings), `CONFIRMED`,
`HANDOFF_FAILED`, `REJECTED`, `CANCELLED`.

The order screen's **timeline** is built from these events (nothing is
hard-coded); the full raw trail is one click below it. Acknowledged margin
warnings are redacted in the trail for members who cannot see cost.

The actor is **never** taken from a request body (tested by spoofing it in
`test:order-engine-routes` and `test:sales-order-safety`).

## 6. Notifications — DESIGNED (off by default)

| Event | Emitted when |
|---|---|
| `ORDER_RECEIVED` | an order is received (not on a duplicate) |
| `APPROVAL_REQUIRED` | validation passes |
| `ORDER_EXCEPTION` | validation finds blocking issues |
| `ORDER_ON_HOLD` | held |
| `ORDER_APPROVED` | approved |
| `ORDER_REJECTED` | rejected |
| `ORDER_CONFIRMED` | the Draft sales order is created |

`configureOrderIntakeNotifier(notifier)` installs a notifier; the default is
disabled. A notifier failure never affects the action (tested). Payload:
identifiers, status, counts — no names, prices or lines. Connecting these to
the existing VYRON ORDER recipients/delivery engine, and deciding who receives
what, is a client decision and is **not** made.

## 7. Screens — IMPLEMENTED; exercised in a browser harness

- Order Inbox (`/order-inbox`): tabs, filters, paging, source states.
- Order detail (`/order-inbox/[id]`): summary, customer, lines, validation
  (blocking / warnings / information, each with its action), stock &
  production, financial summary (approvers only), decision panel, linked sales
  order, timeline, audit trail.
- Exception Centre (`/order-inbox/exceptions`), Order rules & mappings
  (`/order-inbox/rules`).

All pages are gated server-side (`requireWorkspacePage("sales_orders.view")`);
buttons reflect the member's permissions and the server enforces them again.
