export type IntegrationProviderId =
  | "xero"
  | "sage"
  | "quickbooks"
  | "shopify"
  | "woocommerce"
  | "power_bi";

export type IntegrationDefinition = {
  id: IntegrationProviderId;
  label: string;
  status: "active" | "planned";
  featureKey: "xero_sync" | "integrations";
};

export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
  { id: "xero", label: "Xero", status: "active", featureKey: "xero_sync" },
  { id: "sage", label: "Sage", status: "planned", featureKey: "integrations" },
  { id: "quickbooks", label: "QuickBooks", status: "planned", featureKey: "integrations" },
  { id: "shopify", label: "Shopify", status: "planned", featureKey: "integrations" },
  { id: "woocommerce", label: "WooCommerce", status: "planned", featureKey: "integrations" },
  { id: "power_bi", label: "Power BI", status: "planned", featureKey: "integrations" },
];

export function listIntegrations(status?: "active" | "planned") {
  if (!status) return INTEGRATION_REGISTRY;
  return INTEGRATION_REGISTRY.filter((row) => row.status === status);
}

export function getIntegration(id: IntegrationProviderId) {
  return INTEGRATION_REGISTRY.find((row) => row.id === id) || null;
}
