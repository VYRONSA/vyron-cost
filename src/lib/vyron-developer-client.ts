import { clearWorkspaceSession } from "@/lib/vyron-workspace-session";
import { clearActiveClientCookie, syncActiveClientCookie } from "@/lib/vyron-workspace-context";

export const ACTIVE_CLIENT_KEY = "vyron_cost_active_client";
export const DEVELOPER_CLIENTS_KEY = "vyron_cost_developer_clients";
export const DEVELOPER_SELECTED_CLIENT_KEY = "vyron_developer_selected_client";
export const DEVELOPER_EDITING_CLIENT_KEY = "vyron_developer_editing_client";
export const IMPERSONATION_SESSION_KEY = "vyron_developer_impersonation";

export type ActiveClientStatus =
  | "Active"
  | "Demo"
  | "Setup"
  | "Suspended"
  | "Archived";

export type ClientLoginDisplayStatus =
  | "active_login"
  | "no_login_created"
  | "disabled_login";

export type ActiveClient = {
  id: string;
  companyName: string;
  tradingName: string;
  packageName: string;
  status: ActiveClientStatus;
  companyId?: string | null;
  demoMode?: boolean;
  ownerUserId?: string | null;
  ownerEmail?: string;
  impersonating?: boolean;
  loginDisplayStatus?: ClientLoginDisplayStatus;
  userLimit?: number;
  contactEmail?: string;
  phone?: string;
  vatNumber?: string;
  registrationNumber?: string;
  physicalAddress?: string;
  postalAddress?: string;
  defaultVatRate?: number;
  xeroStatus?: string;
};

function normalizeActiveStatus(status: string): ActiveClientStatus {
  if (status === "Live") return "Active";

  if (
    status === "Active" ||
    status === "Demo" ||
    status === "Setup" ||
    status === "Suspended" ||
    status === "Archived"
  ) {
    return status;
  }

  return "Setup";
}

function normaliseClient(
  parsed: ActiveClient & { status: string }
): ActiveClient {
  return {
    ...parsed,
    status: normalizeActiveStatus(parsed.status),
    companyName:
      parsed.companyName ||
      parsed.tradingName ||
      "Client Workspace",
    tradingName:
      parsed.tradingName ||
      parsed.companyName ||
      "Client Workspace",
    packageName: parsed.packageName || "Professional",
  };
}

export function readActiveClient(): ActiveClient | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(
      ACTIVE_CLIENT_KEY
    );

    if (!raw) return null;

    const parsed = JSON.parse(
      raw
    ) as ActiveClient & { status: string };

    const client = normaliseClient(parsed);

    if (client.status === "Archived") {
      clearActiveClient();
      return null;
    }

    return client;
  } catch {
    return null;
  }
}

export function writeActiveClient(
  client: ActiveClient
) {
  const normalised = normaliseClient(
    client as ActiveClient & { status: string }
  );

  if (normalised.status === "Archived") {
    clearActiveClient();
    return;
  }

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(
      ACTIVE_CLIENT_KEY,
      JSON.stringify(normalised)
    );
  }

  syncActiveClientCookie(normalised);

  if (
    normalised.impersonating &&
    typeof sessionStorage !== "undefined"
  ) {
    sessionStorage.setItem(
      IMPERSONATION_SESSION_KEY,
      "1"
    );
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new Event("vyron-active-client-changed")
    );
  }
}

export function clearActiveClient() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(ACTIVE_CLIENT_KEY);
  }

  clearActiveClientCookie();

  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(
      IMPERSONATION_SESSION_KEY
    );
    sessionStorage.removeItem(
      DEVELOPER_SELECTED_CLIENT_KEY
    );
  }
}

export function exitClientWorkspace() {
  clearActiveClient();

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new Event("vyron-active-client-changed")
    );
  }
}

export function isImpersonatingClient() {
  const client = readActiveClient();
  return Boolean(client?.impersonating);
}

export function isPlatformAdminImpersonating() {
  if (typeof window === "undefined") {
    return false;
  }

  const client = readActiveClient();

  return (
    Boolean(client?.impersonating) ||
    sessionStorage.getItem(
      IMPERSONATION_SESSION_KEY
    ) === "1"
  );
}

export function isClientWorkspaceMode() {
  return readActiveClient() !== null;
}

export function signOutClientWorkspace() {
  const returnToDeveloper =
    isPlatformAdminImpersonating();

  exitClientWorkspace();
  clearWorkspaceSession();

  window.location.href = returnToDeveloper
    ? "/developer/clients"
    : "/login";
}