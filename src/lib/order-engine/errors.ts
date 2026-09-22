export type OrderEngineErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_TRANSITION"
  | "CONFLICT"
  | "DUPLICATE_SOURCE_CONFLICT"
  | "VALIDATION_REQUIRED"
  | "VALIDATION_FAILED"
  | "WARNINGS_NOT_ACKNOWLEDGED"
  | "HANDOFF_FAILED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "NOT_ENABLED";

const STATUS: Record<OrderEngineErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  INVALID_TRANSITION: 409,
  CONFLICT: 409,
  DUPLICATE_SOURCE_CONFLICT: 409,
  VALIDATION_REQUIRED: 409,
  VALIDATION_FAILED: 409,
  WARNINGS_NOT_ACKNOWLEDGED: 409,
  HANDOFF_FAILED: 502,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PAYLOAD_TOO_LARGE: 413,
  NOT_ENABLED: 503,
};

/** A failure the caller can act on. Routes map `status` straight onto the HTTP response. */
export class OrderEngineError extends Error {
  readonly code: OrderEngineErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: OrderEngineErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "OrderEngineError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

/** True for PostgREST/Postgres "the table is not there" — the migration has not been applied. */
export function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: string }).code || "");
  const message = String((error as { message?: string }).message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

/** True for a unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: string }).code || "");
  const message = String((error as { message?: string }).message || "").toLowerCase();
  return code === "23505" || message.includes("duplicate key");
}

/** Throw the Supabase error, translating a missing table into NOT_ENABLED. */
export function raiseDbError(error: unknown, context: string): never {
  if (isMissingRelation(error)) {
    throw new OrderEngineError(
      "NOT_ENABLED",
      "The Order Engine is not yet enabled for this database (migration 20260922120000 has not been applied)."
    );
  }
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
  throw new Error(`${context}: ${message}`);
}
