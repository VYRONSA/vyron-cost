/**
 * Order Engine notifications.
 *
 * OFF BY DEFAULT. The Order Engine emits business events; whether anyone is
 * told — and how — is a per-client decision that has not been made. Until a
 * notifier is configured explicitly the events go nowhere.
 *
 * A later step can bridge these to the existing VYRON ORDER notification engine
 * (src/lib/vyron-order-notifications.ts: recipients by role, in-app / e-mail /
 * SMS / WhatsApp, idempotent delivery rows). That bridge is DESIGNED, not built:
 * see docs/order-engine/APPROVAL_MODEL.md §Notifications.
 *
 * A notifier must never throw into the caller: a failed notification must not
 * undo or block an approval that has already been recorded.
 */

export const ORDER_INTAKE_EVENTS = [
  "ORDER_RECEIVED",
  "APPROVAL_REQUIRED",
  "ORDER_EXCEPTION",
  "ORDER_ON_HOLD",
  "ORDER_APPROVED",
  "ORDER_REJECTED",
  "ORDER_CONFIRMED",
] as const;

export type OrderIntakeEvent = (typeof ORDER_INTAKE_EVENTS)[number];

/** Deliberately minimal: identifiers and counts only — no customer names, e-mail addresses, prices or lines. */
export type OrderIntakeNotification = {
  event: OrderIntakeEvent;
  companyId: string;
  intakeId: string;
  intakeNumber: string;
  source: string;
  status: string;
  blockingIssues?: number;
  warnings?: number;
  salesOrderNumber?: string | null;
  at: string;
};

export interface OrderIntakeNotifier {
  readonly enabled: boolean;
  notify(notification: OrderIntakeNotification): Promise<void>;
}

export const disabledNotifier: OrderIntakeNotifier = {
  enabled: false,
  async notify() {
    // Notifications are off until explicitly configured.
  },
};

/** Collects notifications in memory — for tests and for previewing what would be sent. */
export function createRecordingNotifier(): OrderIntakeNotifier & { sent: OrderIntakeNotification[] } {
  const sent: OrderIntakeNotification[] = [];
  return {
    enabled: true,
    sent,
    async notify(notification) {
      sent.push(notification);
    },
  };
}

let configured: OrderIntakeNotifier = disabledNotifier;

/** Install a notifier (server start-up or tests). Passing nothing restores the disabled default. */
export function configureOrderIntakeNotifier(notifier?: OrderIntakeNotifier | null): void {
  configured = notifier || disabledNotifier;
}

export function currentOrderIntakeNotifier(): OrderIntakeNotifier {
  return configured;
}

/** Send, never throw. */
export async function emitOrderIntakeNotification(notification: Omit<OrderIntakeNotification, "at">): Promise<void> {
  const notifier = configured;
  if (!notifier.enabled) return;
  try {
    await notifier.notify({ ...notification, at: new Date().toISOString() });
  } catch {
    // Swallowed on purpose: the business action has already been committed.
  }
}
