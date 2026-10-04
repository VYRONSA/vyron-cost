import type { StoreChannel, StoreSale } from "@/lib/store-sales/types";

/**
 * What a channel must provide. A connector only talks to its platform and
 * translates; it never matches, prices, posts or decides — the shared engine
 * (service.ts) does that once for every channel.
 */

export type ConnectionRef = { channel: StoreChannel; store_url: string; company_id: string };

export type OrderListQuery =
  /** Historical import: orders created in [createdFrom, createdBefore), oldest first. */
  | { createdFrom: string; createdBefore: string | null; updatedSince?: undefined; cursor: string | null; pageSize: number }
  /** Catch-up: orders changed since an instant (missed webhooks). */
  | { updatedSince: string; createdFrom?: undefined; createdBefore?: undefined; cursor: string | null; pageSize: number };

export type OrderIdPage = { ids: string[]; nextCursor: string | null };

export type StoreConnector = {
  channel: StoreChannel;
  /** The order with its refunds; null when the store has no such order. Throws StoreApiError. */
  fetchSale(connection: ConnectionRef, orderId: string): Promise<StoreSale | null>;
  /** One page of order ids. A null nextCursor means this was the last page. */
  listOrderIds(connection: ConnectionRef, query: OrderListQuery): Promise<OrderIdPage>;
  /** Prove the credentials and permissions with one read. */
  testConnection(connection: ConnectionRef): Promise<{ name: string | null; currency: string | null; detail: string }>;
  /** Subscribe the store's events to VOLORA, where the platform allows it with read access. */
  registerWebhooks?(connection: ConnectionRef, callbackUrl: string): Promise<Array<{ id: string; topic: string; uri: string }>>;
};
