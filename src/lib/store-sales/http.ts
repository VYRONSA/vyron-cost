import { NextResponse } from "next/server";
import { orderErrorResponse } from "@/lib/order-engine/http";
import { StoreApiError, StoreSyncError } from "@/lib/store-sales/errors";
import type { StoreChannel } from "@/lib/store-sales/types";

/**
 * Error responses for the store-sales API. Authentication, permission and the
 * company come from the same plumbing as the Order Engine (orderRouteContext):
 * the verified session, never the request.
 */
export function storeErrorResponse(error: unknown, fallback: string) {
  if (error instanceof StoreSyncError) {
    return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
  }
  if (error instanceof StoreApiError) {
    return NextResponse.json({ ok: false, code: "STORE_API", retryable: error.retryable, error: error.message }, { status: 502 });
  }
  return orderErrorResponse(error, fallback);
}

/** The public addresses the stores deliver webhooks to. */
export function webhookCallbackUrl(channel: StoreChannel): string {
  const base = String(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  return `${base}/api/integrations/${channel === "SHOPIFY" ? "shopify" : "woocommerce"}/webhooks`;
}

/**
 * Run work after the response (Next `after`); without a request scope to defer
 * into, start it without holding the response. The scheduled run is the safety
 * net if it does not finish.
 */
export function runAfterResponse(after: (task: () => Promise<void>) => void, task: () => Promise<void>, label: string): void {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[store-sales] ${label} failed`, error instanceof Error ? error.message : error);
    }
  };
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
