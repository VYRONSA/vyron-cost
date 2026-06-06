export const ACTIVE_CLIENT_KEY = "vyron_cost_active_client";
export const DEVELOPER_CLIENTS_KEY = "vyron_cost_developer_clients";
export const DEVELOPER_SELECTED_CLIENT_KEY = "vyron_developer_selected_client";
export const DEVELOPER_EDITING_CLIENT_KEY = "vyron_developer_editing_client";

export type ActiveClient = {
  id: string;
  companyName: string;
  tradingName: string;
  packageName: string;
  status: "Live" | "Demo" | "Setup" | "Suspended";
};

export function readActiveClient(): ActiveClient | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_CLIENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveClient;
  } catch {
    return null;
  }
}

export function writeActiveClient(client: ActiveClient) {
  localStorage.setItem(ACTIVE_CLIENT_KEY, JSON.stringify(client));
}

export function clearActiveClient() {
  localStorage.removeItem(ACTIVE_CLIENT_KEY);
}
