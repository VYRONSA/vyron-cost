import type { OrderCandidate, OrderSource } from "@/lib/order-engine/types";

/**
 * An order source. An adapter only translates: it never matches customers or
 * products, never prices, never decides a status. Receive → parse → normalise
 * into the one OrderCandidate shape, and hand that to receiveOrderCandidate.
 *
 * `connected` is false for every external platform today: the adapter exists
 * and is tested against the platform's documented payload shape, but VYRON is
 * not connected to any store, mailbox or API.
 */
export interface OrderSourceAdapter<Raw> {
  readonly source: OrderSource;
  readonly connected: boolean;
  normalize(raw: Raw): OrderCandidate;
}

/** Thrown by an adapter when the raw payload cannot be read as an order. */
export class OrderSourceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderSourceParseError";
  }
}
