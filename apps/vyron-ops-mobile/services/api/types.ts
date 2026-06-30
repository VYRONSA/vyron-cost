export class ApiClientError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  authenticated?: boolean;
};

export type TokenProvider = () => Promise<string | null>;
export type UnauthorizedHandler = () => Promise<void>;
