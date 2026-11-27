/*
 * Approving a supplier invoice despite READING or TOTALS validation warnings.
 *
 * These warnings mean the extraction could not read every line, or the lines do
 * not add up to the invoice totals. The person processing the invoice is the one
 * holding the paper invoice, so they may approve it themselves — no supervisor
 * permission — provided they write a note explaining why. The note, their
 * identity, the time and every warning are recorded before anything is costed.
 *
 * Every OTHER policy blocker (purchase order required, missing supplier, invoice
 * number or date, VAT required, ignored or unmatched lines, PO link required)
 * still needs the "Override invoice approval policy" permission, exactly as
 * before. An invoice that has any of those is a supervisor override as a whole.
 *
 * Shared by the approve route (authoritative) and the review dialog (display),
 * so the two can never disagree about which path an invoice takes.
 */

/** Rules the processing user may approve over with a note. */
export const NOTE_OVERRIDABLE_RULES: ReadonlySet<string> = new Set([
  // Invoice reading (extraction quality)
  "extraction_incomplete",
  "extraction_totals_not_reconciled",
  "extraction_column_mapping_failed",
  "min_header_confidence",
  // Invoice totals
  "allow_rounding_difference",
  "major_totals_mismatch",
  "rounding_difference",
  "max_allowed_variance_percent",
]);

/** A note shorter than this (ignoring spaces) does not explain anything. */
export const MIN_OVERRIDE_NOTE_CHARS = 10;

type Violation = { rule: string; severity: "error" | "warning" | string };

/** Blocking rules on this invoice that still need a supervisor. Empty when a note is enough. */
export function rulesNeedingSupervisor(violations: readonly Violation[]): string[] {
  return violations
    .filter((v) => v.severity === "error" && !NOTE_OVERRIDABLE_RULES.has(v.rule))
    .map((v) => v.rule);
}

/** True when the invoice is blocked only by reading/totals warnings. */
export function isNoteOverride(violations: readonly Violation[]): boolean {
  const blocking = violations.filter((v) => v.severity === "error");
  return blocking.length > 0 && rulesNeedingSupervisor(violations).length === 0;
}

/** The note as it will be stored: trimmed, otherwise exactly as written. */
export function normaliseOverrideNote(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Why a note is not acceptable, or null when it is.
 * Rejects blank, whitespace-only, too-short and letter-free notes ("..........", "1111111111").
 */
export function overrideNoteProblem(raw: unknown): string | null {
  const note = normaliseOverrideNote(raw);
  if (!note) return "An approval note is required. Explain why you are approving this invoice despite the warnings.";
  if (note.replace(/\s+/g, "").length < MIN_OVERRIDE_NOTE_CHARS) {
    return `The approval note is too short. Explain why you are approving despite the warnings (at least ${MIN_OVERRIDE_NOTE_CHARS} characters).`;
  }
  if (!/\p{L}/u.test(note)) return "The approval note must explain the reason in words.";
  return null;
}
