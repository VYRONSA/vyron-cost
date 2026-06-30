import { appConfig } from "@/utils/config";
import { ApiClientError, type ApiRequestOptions, type TokenProvider, type UnauthorizedHandler } from "./types";

let tokenProvider: TokenProvider = async () => null;
let unauthorizedHandler: UnauthorizedHandler = async () => undefined;

export function configureApiClient(input: {
  getAccessToken?: TokenProvider;
  onUnauthorized?: UnauthorizedHandler;
}) {
  if (input.getAccessToken) tokenProvider = input.getAccessToken;
  if (input.onUnauthorized) unauthorizedHandler = input.onUnauthorized;
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl = appConfig.apiBaseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (options.authenticated !== false) {
      const token = await tokenProvider();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "include",
    });

    const payload = await response.json().catch(() => ({}));

    if (response.status === 401) {
      await unauthorizedHandler();
      throw new ApiClientError("Session expired. Please sign in again.", 401);
    }

    if (!response.ok) {
      const message =
        typeof payload?.error === "string"
          ? payload.error
          : `Request failed with status ${response.status}`;
      throw new ApiClientError(message, response.status);
    }

    return payload as T;
  }

  get<T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  post<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  patch<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) {
    return this.request<T>(path, { ...options, method: "PATCH", body });
  }
}

export const apiClient = new ApiClient();
