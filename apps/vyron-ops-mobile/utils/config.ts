import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;

export const appConfig = {
  name: "VYRON OPS",
  productId: "vyron_ops" as const,
  version: Constants.expoConfig?.version ?? "1.0.0",
  apiBaseUrl: extra?.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3007",
  secureStoreKeys: {
    accessToken: "vyron_ops_access_token",
    refreshToken: "vyron_ops_refresh_token",
    session: "vyron_ops_session",
  },
};
