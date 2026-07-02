export type VyronProductId = "vyron_cost" | "vyron_core" | "vyron_pay" | "vyron_farm" | "vyron_reach" | "vyron_ops";

export type AuthSession = {
  accessToken: string | null;
  refreshToken: string | null;
  email: string | null;
  userId: string | null;
  expiresAt: string | null;
};

export type TenantContext = {
  workspaceId: string | null;
  companyId: string | null;
  companyName: string;
  tradingName: string;
  packageName: string;
};

export type OpsUserProfile = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

export type ApiErrorBody = {
  ok: false;
  error: string;
  status?: number;
};

export type ApiSuccessBody<T> = {
  ok: true;
  data: T;
};

export type DashboardPlaceholderCard = {
  id: string;
  title: string;
  subtitle: string;
  accent: "emerald" | "violet" | "amber" | "rose" | "sky";
};

export type OfflineQueueItem = {
  id: string;
  module: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export * from "./receiving";
export * from "./production";
export * from "./store-orders";
export * from "./inventory";
export * from "./supervisor";
export * from "./scanner";
export * from "./sync";
export * from "./sales";
