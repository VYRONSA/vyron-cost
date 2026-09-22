import type { OrderSource } from "@/lib/order-engine/types";

/**
 * The order sources and their honest state. The UI shows exactly this; nothing
 * claims to be connected that is not.
 *
 *   READY          works today, end to end, in this build
 *   NOT_CONNECTED  the adapter exists and is tested against the source's
 *                  documented format, but VYRON is not connected to any account
 *   COMING_SOON    designed (docs/order-engine/ORDER_SOURCE_ADAPTERS.md), not built
 */
export type OrderSourceState = "READY" | "NOT_CONNECTED" | "COMING_SOON";

export type OrderSourceInfo = {
  source: OrderSource;
  label: string;
  state: OrderSourceState;
  detail: string;
};

export const ORDER_SOURCE_REGISTRY: readonly OrderSourceInfo[] = [
  { source: "manual", label: "Manual entry", state: "READY", detail: "Key an order in from the New order screen." },
  { source: "csv", label: "CSV file", state: "READY", detail: "Upload one order per file; the same file twice is recognised." },
  {
    source: "email",
    label: "E-mail",
    state: "NOT_CONNECTED",
    detail: "The inbound e-mail boundary is built and tested (CSV attachments become orders). No mailbox or e-mail provider is connected.",
  },
  {
    source: "woocommerce",
    label: "WooCommerce",
    state: "NOT_CONNECTED",
    detail: "Order conversion is built and tested against WooCommerce's order format. No store is connected and no credentials are held.",
  },
  {
    source: "shopify",
    label: "Shopify",
    state: "NOT_CONNECTED",
    detail: "Order conversion is built and tested against Shopify's order format. No store is connected and no credentials are held.",
  },
  {
    source: "xlsx",
    label: "Excel file",
    state: "COMING_SOON",
    detail: "Save the sheet as CSV for now. Reading .xlsx on the server waits for a parser without the known issues of the bundled one.",
  },
  { source: "pdf", label: "PDF order", state: "COMING_SOON", detail: "Designed: document extraction as a reviewed candidate, never an approval." },
  { source: "api", label: "API", state: "COMING_SOON", detail: "Designed: a tenant API key with an idempotency key per order." },
  { source: "edi", label: "EDI", state: "COMING_SOON", detail: "Designed: mapped onto the same order candidate." },
];
