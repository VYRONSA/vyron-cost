/**
 * VYRON — AI provider availability errors.
 *
 * WHY THIS EXISTS
 * ---------------
 * When the OpenAI account ran out of credit the provider returned HTTP 429 with
 * `credit_balance_exhausted`. The extraction engine wrapped it in a plain Error,
 * the route's catch-all turned that into HTTP 500, and the operator was shown
 * "Internal Server Error" for a billing condition.
 *
 * That is wrong twice over. It tells the operator the software is broken when it
 * is not, and it hides an actionable condition — top up the account — behind a
 * message that suggests filing a bug. A provider being unavailable is a
 * 503-class fact about a dependency, never a 500-class fact about us.
 *
 * The condition is carried as a typed error rather than a matched message
 * string, so the route can classify it without parsing provider prose that may
 * change without notice.
 */

export type AiServiceUnavailableReason =
  /** Account has no credit or has exceeded its quota. Billing action required. */
  | "quota-exhausted"
  /** Provider rate limit. Retrying later will succeed. */
  | "rate-limited"
  /** Provider returned 5xx, or the request could not be delivered. */
  | "provider-error";

export class AiServiceUnavailableError extends Error {
  readonly reason: AiServiceUnavailableReason;
  /** HTTP status the provider returned, when there was one. */
  readonly providerStatus: number | null;
  /** What the operator should be told. Never provider prose, never a stack. */
  readonly operatorMessage: string;

  constructor(input: {
    reason: AiServiceUnavailableReason;
    providerStatus: number | null;
    detail: string;
  }) {
    super(`AI service unavailable (${input.reason}): ${input.detail}`);
    this.name = "AiServiceUnavailableError";
    this.reason = input.reason;
    this.providerStatus = input.providerStatus;
    this.operatorMessage = OPERATOR_MESSAGE[input.reason];
  }
}

const OPERATOR_MESSAGE: Record<AiServiceUnavailableReason, string> = {
  "quota-exhausted":
    "The AI service is temporarily unavailable. The account has reached its usage limit — extraction will resume once it is topped up. The document has been saved and can be captured manually in the meantime.",
  "rate-limited":
    "The AI service is busy and briefly rejected this request. Try again in a moment. The document has been saved.",
  "provider-error":
    "The AI service is temporarily unavailable. The document has been saved and can be extracted again shortly.",
};

/**
 * Classify a provider response, or return null when it is not an availability
 * problem.
 *
 * 429 is deliberately split. A quota exhaustion needs a person to add credit; a
 * rate limit resolves itself. Telling an operator to "try again shortly" when
 * the account is empty would have them retrying a request that cannot succeed.
 */
export function classifyAiProviderFailure(input: {
  status: number;
  body: unknown;
}): AiServiceUnavailableError | null {
  const error = (input.body as { error?: { code?: string; type?: string; message?: string } } | undefined)?.error;
  const code = String(error?.code || error?.type || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  const detail = error?.message || `HTTP ${input.status}`;

  const quotaSignals =
    code.includes("credit_balance_exhausted") ||
    code.includes("insufficient_quota") ||
    code.includes("billing") ||
    message.includes("no credits remaining") ||
    message.includes("exceeded your current quota") ||
    message.includes("billing");

  if (input.status === 429) {
    return new AiServiceUnavailableError({
      reason: quotaSignals ? "quota-exhausted" : "rate-limited",
      providerStatus: 429,
      detail,
    });
  }

  // A 402 is unambiguous about billing whatever the body says.
  if (input.status === 402) {
    return new AiServiceUnavailableError({ reason: "quota-exhausted", providerStatus: input.status, detail });
  }

  if (input.status >= 500) {
    return new AiServiceUnavailableError({ reason: "provider-error", providerStatus: input.status, detail });
  }

  // Some deployments report quota on a 400. The signal, not the status, decides.
  if (quotaSignals) {
    return new AiServiceUnavailableError({ reason: "quota-exhausted", providerStatus: input.status, detail });
  }

  return null;
}

/** True when this error means the provider was unavailable, at any call depth. */
export function isAiServiceUnavailable(error: unknown): error is AiServiceUnavailableError {
  return error instanceof AiServiceUnavailableError;
}
