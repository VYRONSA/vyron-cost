import type { ValidationIssue } from "@/lib/order-engine/types";

/**
 * Cost and margin are commercial data, shown only to members who can approve
 * orders (the same rule as the Order Centre). Everything that leaves the API
 * for a member without that permission passes through here.
 *
 * Margin issues keep their code and severity — a clerk must still see that an
 * approver has something to check — but lose any message detail or data.
 */
export const COST_PERMISSION = "sales_orders.approve";

export function redactIssue(issue: ValidationIssue, canSeeCost: boolean): ValidationIssue {
  if (canSeeCost || issue.category !== "margin") return issue;
  return { ...issue, message: "Margin check — visible to approvers.", data: undefined };
}

type SnapshotLike = {
  issues?: ValidationIssue[];
  lines?: Array<Record<string, unknown>>;
  totals?: Record<string, unknown>;
};

export function redactValidation<T>(validation: T, canSeeCost: boolean): T {
  if (canSeeCost || !validation || typeof validation !== "object") return validation;
  const v = validation as unknown as SnapshotLike;
  if (!v.issues && !v.lines && !v.totals) return validation;
  return {
    ...(validation as object),
    issues: (v.issues || []).map((issue) => redactIssue(issue, false)),
    lines: (v.lines || []).map((line) => ({ ...line, unitCost: null, lineCost: null, lineGp: null })),
    totals: v.totals ? { ...v.totals, expectedCost: null, expectedGp: null, expectedGpPct: null } : v.totals,
  } as unknown as T;
}

/** Event metadata can quote acknowledged warnings verbatim: redact margin ones for non-cost viewers. */
export function redactEventMetadata(metadata: Record<string, unknown>, canSeeCost: boolean): Record<string, unknown> {
  if (canSeeCost || !metadata || typeof metadata !== "object") return metadata;
  const acknowledged = metadata.acknowledgedWarnings;
  if (!Array.isArray(acknowledged)) return metadata;
  return {
    ...metadata,
    acknowledgedWarnings: acknowledged.map((w: { code?: string; message?: string }) =>
      ["NEGATIVE_MARGIN", "LOW_MARGIN", "MARGIN_NOT_MEASURED"].includes(String(w?.code)) ? { ...w, message: "Margin check — visible to approvers." } : w
    ),
  };
}
