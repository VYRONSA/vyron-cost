/*
 * Purchase order status rules, with no server imports so the screens can use
 * the same rules the API enforces.
 */

/**
 * Statuses in which an order may still be changed through the edit route.
 *
 * Draft and Submitted are not yet approved; the other three are how an approver
 * hands an order back for amendment. Once an order is approved it is a
 * commitment to the supplier: it changes only through a status action, never by
 * re-saving its lines.
 */
export const PO_EDITABLE_STATUSES = [
  "Draft",
  "Submitted",
  "Rejected",
  "Awaiting Revision",
  "Returned for Changes",
] as const;

/** Statuses an order may move to, and the statuses it may move from. */
const PO_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  Draft: PO_EDITABLE_STATUSES,
  Submitted: PO_EDITABLE_STATUSES,
  Approved: PO_EDITABLE_STATUSES,
  // An approver may hand an approved order back before it goes to the supplier.
  Rejected: [...PO_EDITABLE_STATUSES, "Approved"],
  "Awaiting Revision": [...PO_EDITABLE_STATUSES, "Approved"],
  "Returned for Changes": [...PO_EDITABLE_STATUSES, "Approved"],
  Sent: ["Approved"],
  Closed: ["Approved", "Sent", "Partially Received", "Fully Received"],
  Cancelled: [...PO_EDITABLE_STATUSES, "Approved", "Sent"],
};

/** The statuses that hand an order back to the buyer, who may then edit it. */
export const PO_HANDBACK_STATUSES = ["Rejected", "Awaiting Revision", "Returned for Changes"] as const;

/**
 * Whether the desktop "Return for changes" action applies: an approved order not
 * yet sent to the supplier. Received orders never qualify, and the server also
 * refuses any order with goods booked against it.
 */
export function canReturnPoForChanges(status: string | null | undefined) {
  return String(status || "") === "Approved";
}

/** A change the order's status does not allow. Carries the HTTP status to answer with. */
export class PurchaseOrderStatusError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "PurchaseOrderStatusError";
    this.status = status;
  }
}

export function isPoEditableStatus(status: string | null | undefined) {
  return (PO_EDITABLE_STATUSES as readonly string[]).includes(String(status || ""));
}

/** Whether an order in `from` may move to `to`. */
export function canTransitionPo(from: string | null | undefined, to: string) {
  return Boolean(PO_STATUS_TRANSITIONS[to]?.includes(String(from || "Draft")));
}

/** Throws unless an order in `from` may move to `to`. */
export function assertPoStatusTransition(from: string | null | undefined, to: string) {
  const current = String(from || "Draft");
  const allowedFrom = PO_STATUS_TRANSITIONS[to];
  if (!allowedFrom) {
    throw new PurchaseOrderStatusError(
      to === "Partially Received" || to === "Fully Received"
        ? `"${to}" is set by goods receipts, not by a status change.`
        : `"${to}" is not a purchase order status.`,
      400
    );
  }
  if (!allowedFrom.includes(current)) {
    throw new PurchaseOrderStatusError(`A ${current} purchase order cannot be moved to ${to}.`);
  }
}

/**
 * Throws unless a save may set `requested`.
 *
 * Saving only ever drafts, submits, or keeps an amendment status as it is.
 * Approval and everything after it are status actions with their own
 * permission, so a save asking for any of them is refused rather than obeyed.
 */
export function assertPoSaveStatus(currentStatus: string | null, requested: string) {
  if (requested === "Draft" || requested === "Submitted") return;
  if (currentStatus && requested === currentStatus && isPoEditableStatus(currentStatus)) return;
  throw new PurchaseOrderStatusError(
    `Saving a purchase order cannot set it to ${requested}. Save it as Draft or Submitted, then use the ${requested} action.`,
    400
  );
}

export function lockedOrderError(status: string) {
  return new PurchaseOrderStatusError(
    `This purchase order is ${status} and can no longer be edited. Return it for changes, or cancel it and raise a new order.`
  );
}
