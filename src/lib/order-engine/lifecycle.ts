import type {
  ApprovalStatus,
  FulfilmentStatus,
  IntakeStatus,
  InvoiceStatus,
} from "@/lib/order-engine/types";

/**
 * The intake state machine. Pure: no database, no clock. The service performs
 * each move as a compare-and-set on (id, company, status, version).
 *
 * Fulfilment and invoicing are NOT states of an intake — once confirmed, the
 * existing sales-order engine owns them, and the intake derives them from the
 * linked sales order (deriveFulfilmentStatus / deriveInvoiceStatus).
 */

export type IntakeAction =
  | "validate"
  | "approve"
  | "confirm"
  | "hold"
  | "release"
  | "request_changes"
  | "reject"
  | "cancel";

export const INTAKE_ACTIONS: readonly IntakeAction[] = [
  "validate",
  "approve",
  "confirm",
  "hold",
  "release",
  "request_changes",
  "reject",
  "cancel",
];

/** Where each action may start from. */
export const ACTION_FROM: Record<IntakeAction, readonly IntakeStatus[]> = {
  validate: ["RECEIVED", "EXCEPTION"],
  approve: ["AWAITING_APPROVAL"],
  confirm: ["APPROVED"],
  hold: ["AWAITING_APPROVAL"],
  release: ["ON_HOLD"],
  request_changes: ["AWAITING_APPROVAL", "ON_HOLD"],
  reject: ["AWAITING_APPROVAL", "ON_HOLD", "EXCEPTION"],
  cancel: ["RECEIVED", "EXCEPTION", "AWAITING_APPROVAL", "ON_HOLD"],
};

/** The workspace permission each action needs. Existing sales_orders.* keys — nothing invented. */
export const ACTION_PERMISSION: Record<IntakeAction, string> = {
  validate: "sales_orders.create",
  approve: "sales_orders.approve",
  confirm: "sales_orders.approve",
  hold: "sales_orders.approve",
  release: "sales_orders.approve",
  request_changes: "sales_orders.approve",
  reject: "sales_orders.approve",
  cancel: "sales_orders.edit",
};

/** Actions that must carry a human reason. */
export const ACTION_REQUIRES_REASON: ReadonlySet<IntakeAction> = new Set(["hold", "request_changes", "reject", "cancel"]);

/** Statuses in which the order content (customer, lines, matches) may be edited. */
export const EDITABLE_STATUSES: readonly IntakeStatus[] = ["RECEIVED", "EXCEPTION"];

export const TERMINAL_STATUSES: readonly IntakeStatus[] = ["CONFIRMED", "REJECTED", "CANCELLED"];

/** Every edge the machine can take. Used by tests and by the UI. */
export const TRANSITIONS: Record<IntakeStatus, readonly IntakeStatus[]> = {
  RECEIVED: ["AWAITING_APPROVAL", "EXCEPTION", "CANCELLED"],
  EXCEPTION: ["RECEIVED", "AWAITING_APPROVAL", "EXCEPTION", "REJECTED", "CANCELLED"],
  // AWAITING_APPROVAL → AWAITING_APPROVAL: approval refused because live data changed (re-validated, still clean).
  AWAITING_APPROVAL: ["APPROVED", "AWAITING_APPROVAL", "EXCEPTION", "ON_HOLD", "RECEIVED", "REJECTED", "CANCELLED"],
  ON_HOLD: ["AWAITING_APPROVAL", "EXCEPTION", "RECEIVED", "REJECTED", "CANCELLED"],
  APPROVED: ["CONFIRMED"],
  CONFIRMED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canStartAction(status: IntakeStatus, action: IntakeAction): boolean {
  return ACTION_FROM[action].includes(status);
}

export function isTransitionAllowed(from: IntakeStatus, to: IntakeStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isEditable(status: IntakeStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/** Actions a viewer could take on an intake in this status, given their permissions. */
export function availableIntakeActions(status: IntakeStatus, hasPermission: (permission: string) => boolean): IntakeAction[] {
  return INTAKE_ACTIONS.filter((action) => canStartAction(status, action) && hasPermission(ACTION_PERMISSION[action]));
}

export function deriveApprovalStatus(status: IntakeStatus): ApprovalStatus {
  switch (status) {
    case "RECEIVED":
    case "EXCEPTION":
    case "AWAITING_APPROVAL":
      return "PENDING";
    case "ON_HOLD":
      return "ON_HOLD";
    case "APPROVED":
    case "CONFIRMED":
      return "APPROVED";
    case "REJECTED":
      return "REJECTED";
    default:
      return "NOT_APPLICABLE";
  }
}

/** From the linked sales order's status (existing engine vocabulary). */
export function deriveFulfilmentStatus(salesOrderStatus: string | null | undefined): FulfilmentStatus {
  switch (salesOrderStatus) {
    case undefined:
    case null:
    case "":
      return "NOT_APPLICABLE";
    case "Draft":
    case "Awaiting Approval":
    case "Approved":
      return "NOT_STARTED";
    case "Picking":
    case "Packed":
      return "IN_PROGRESS";
    case "Dispatched":
    case "Partially Invoiced":
    case "Invoiced":
      return "DISPATCHED";
    case "Cancelled":
      return "CANCELLED";
    default:
      return "NOT_APPLICABLE";
  }
}

export function deriveInvoiceStatus(salesOrderStatus: string | null | undefined): InvoiceStatus {
  if (!salesOrderStatus) return "NOT_APPLICABLE";
  if (salesOrderStatus === "Invoiced") return "INVOICED";
  if (salesOrderStatus === "Partially Invoiced") return "PARTIALLY_INVOICED";
  if (salesOrderStatus === "Cancelled") return "NOT_APPLICABLE";
  return "NOT_INVOICED";
}

export const STATUS_LABEL: Record<IntakeStatus, string> = {
  RECEIVED: "Received",
  EXCEPTION: "Exception",
  AWAITING_APPROVAL: "Awaiting approval",
  ON_HOLD: "On hold",
  APPROVED: "Approved",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};
