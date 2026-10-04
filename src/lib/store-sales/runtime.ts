import { loadStoreCredentials, type StoreCredentials } from "@/lib/store-sales/credentials";
import type { StoreChannel } from "@/lib/store-sales/types";

/**
 * The process boundary of the store connectors: the network, the server
 * environment and the clock. Tests replace these — no live store is needed.
 */
export const storeRuntime: {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  credentials: (channel: StoreChannel, storeUrl: string) => StoreCredentials | null;
  now: () => number;
} = {
  fetch: (input, init) => fetch(input, init),
  credentials: (channel, storeUrl) => loadStoreCredentials(channel, storeUrl),
  now: () => Date.now(),
};

const REQUEST_TIMEOUT_MS = 15_000;

/** fetch with a timeout; a network failure or timeout is reported, never thrown raw. */
export async function timedFetch(url: string, init: RequestInit, onFailure: (message: string) => Error): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await storeRuntime.fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw onFailure(aborted ? "did not answer in time" : "could not be reached");
  } finally {
    clearTimeout(timer);
  }
}
