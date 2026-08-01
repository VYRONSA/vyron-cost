/**
 * VYRON Repository Safety Programme — machine-readable safety report.
 *
 * Phase 2, Priority 4. The foundation for future PAT dashboards.
 *
 * DESIGN
 * ------
 * The report is a RECORD OF WHAT WAS ESTABLISHED, not a summary of what was
 * hoped. Three properties follow from that, and each is a deliberate choice:
 *
 * 1. `cleanup` distinguishes VERIFIED from NOT_VERIFIED from NO_PATTERN. An
 *    asset whose residue could not be checked reports NO_PATTERN, never
 *    VERIFIED. Reporting an unchecked asset as clean is the exact failure the
 *    audit found in the assets themselves.
 *
 * 2. `status` is PASS only when the asset exited 0 AND cleanup did not fail.
 *    A green exit code with surviving residue is not a pass.
 *
 * 3. `environment` records what was RESOLVED, with the confidence and the
 *    effective environment after Rule 4. A dashboard must never show "PAT"
 *    for a run whose environment was never proven.
 *
 * Schema version is stamped so a dashboard can migrate.
 */

export const REPORT_SCHEMA_VERSION = 1;

/**
 * Build the report object.
 *
 * @param {object} input
 * @param {object}  input.decision      evaluateExecution() result
 * @param {string}  input.assetReference as invoked
 * @param {number|null} input.exitCode  child exit code, null if not executed
 * @param {object|null} input.residue   compare() result, null if not checked
 * @param {object|null} input.acknowledgement { approver, token } when Family D
 * @param {string}  input.startedAt     ISO timestamp
 * @param {string}  input.finishedAt    ISO timestamp
 * @param {number}  input.durationMs
 * @param {string}  input.outcome       "executed" | "blocked" | "dry-run"
 */
export function buildReport(input) {
  const { decision, assetReference, exitCode = null, residue = null, acknowledgement = null, startedAt = null, finishedAt = null, durationMs = null, outcome = "executed" } = input;

  const asset = decision?.asset || null;
  const report = decision?.report || null;

  const cleanup = resolveCleanupField(asset, residue, outcome);
  const status = resolveStatus({ outcome, exitCode, cleanup, verdict: decision?.verdict });

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    asset: asset?.file ? asset.file.split("/").pop() : String(assetReference),
    assetId: asset?.id || null,
    assetPath: asset?.file || null,
    family: asset?.family || null,
    risk: asset?.risk || null,
    environment: (report?.environment || "unknown").toUpperCase(),
    environmentVerified: Boolean(report?.verified),
    environmentConfidence: report?.confidence || "none",
    effectiveEnvironment: (decision?.effectiveEnvironment || "unknown").toUpperCase(),
    mutation: asset?.mutation || null,
    authentication: asset?.authentication || [],
    externalIntegrations: asset?.external || [],
    cleanup,
    cleanupDetail: residue
      ? { status: residue.status, summary: residue.summary, netDelta: residue.netDelta, patterns: residue.patterns }
      : null,
    verdict: decision?.verdict || null,
    reasons: decision?.reasons || [],
    acknowledgement: acknowledgement ? { approver: acknowledgement.approver, token: acknowledgement.token } : null,
    outcome,
    exitCode,
    status,
    startedAt,
    finishedAt,
    durationMs,
  };
}

/**
 * VERIFIED       — residue check ran and found nothing surviving
 * NOT_VERIFIED   — residue check ran and found residue, an anomaly, or could not count
 * NO_PATTERN     — asset declares no fixture pattern; cleanup is unverifiable
 * NOT_APPLICABLE — asset does not mutate
 * NOT_CHECKED    — the check was not requested, or the asset did not execute
 */
function resolveCleanupField(asset, residue, outcome) {
  if (asset && asset.mutation === "none") return "NOT_APPLICABLE";
  if (outcome !== "executed") return "NOT_CHECKED";
  if (!residue) return "NOT_CHECKED";
  if (residue.status === "VERIFIED") return "VERIFIED";
  if (residue.status === "NO_PATTERN") return "NO_PATTERN";
  return "NOT_VERIFIED";
}

function resolveStatus({ outcome, exitCode, cleanup, verdict }) {
  if (outcome === "blocked") return "BLOCKED";
  if (outcome === "dry-run") return "DRY_RUN";
  if (verdict === "unregistered") return "BLOCKED";
  if (exitCode !== 0) return "FAIL";
  if (cleanup === "NOT_VERIFIED") return "FAIL";
  return "PASS";
}

/** Compact single-line summary, for a log or a CI annotation. */
export function summariseReport(report) {
  const parts = [
    report.asset,
    `family=${report.family || "?"}`,
    `env=${report.environment}${report.environmentVerified ? "" : "(unverified)"}`,
    `risk=${report.risk || "?"}`,
    `cleanup=${report.cleanup}`,
    `exit=${report.exitCode === null ? "-" : report.exitCode}`,
    `status=${report.status}`,
  ];
  return parts.join("  ");
}
