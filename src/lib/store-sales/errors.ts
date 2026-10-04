export type StoreSyncErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "NOT_CONFIGURED"
  | "NOT_ENABLED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE";

const STATUS: Record<StoreSyncErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  NOT_CONFIGURED: 409,
  NOT_ENABLED: 503,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PAYLOAD_TOO_LARGE: 413,
};

/** A failure a caller can act on; routes map `status` onto the HTTP response. */
export class StoreSyncError extends Error {
  readonly code: StoreSyncErrorCode;
  readonly status: number;
  constructor(code: StoreSyncErrorCode, message: string) {
    super(message);
    this.name = "StoreSyncError";
    this.code = code;
    this.status = STATUS[code];
  }
}

/**
 * A failed call to a store's API. `retryable` is the point: a timeout,
 * throttling or a 5xx is tried again later; a refused credential is not, and
 * becomes visible instead.
 */
export class StoreApiError extends Error {
  readonly retryable: boolean;
  readonly httpStatus: number | null;
  constructor(message: string, retryable: boolean, httpStatus: number | null = null) {
    super(message);
    this.name = "StoreApiError";
    this.retryable = retryable;
    this.httpStatus = httpStatus;
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" ? String((error as { code?: unknown }).code || "") : "";
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

export function isMissingRelation(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("could not find the table") || (message.includes("relation") && message.includes("does not exist"));
}

export function isUniqueViolation(error: unknown): boolean {
  return errorCode(error) === "23505" || errorMessage(error).toLowerCase().includes("duplicate key");
}

/** Throw a database error, turning a missing table into NOT_ENABLED (the migration is not applied). */
export function raiseDb(error: unknown, context: string): never {
  if (isMissingRelation(error)) {
    throw new StoreSyncError("NOT_ENABLED", "Online store sales sync is not enabled for this database (migration 20261004120000 has not been applied).");
  }
  throw new Error(`${context}: ${errorMessage(error)}`);
}

/** Map an HTTP status from a store API onto retryable / not retryable. */
export function classifyHttp(status: number, context: string, platform: string): StoreApiError {
  if (status === 401 || status === 403) return new StoreApiError(`${context}: ${platform} refused the credentials (HTTP ${status}). Check the key and its permissions.`, false, status);
  if (status === 404) return new StoreApiError(`${context}: not found at ${platform} (HTTP 404). Check the store address.`, false, status);
  if (status === 429) return new StoreApiError(`${context}: ${platform} is rate-limiting requests (HTTP 429).`, true, status);
  if (status >= 500) return new StoreApiError(`${context}: ${platform} had a server error (HTTP ${status}).`, true, status);
  return new StoreApiError(`${context}: ${platform} answered HTTP ${status}.`, false, status);
}
