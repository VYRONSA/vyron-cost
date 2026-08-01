/**
 * VYRON Repository Safety Programme — environment verification.
 *
 * Priority 2 of RSP Phase 1. One implementation of environment detection,
 * consumed by every safety consumer. Detection logic must not be duplicated
 * into individual assets.
 *
 * DESIGN — never infer environment from a single indicator
 * --------------------------------------------------------
 * The audit established two defects this module exists to close:
 *
 *   1. NEXT_PUBLIC_APP_URL defaults to http://localhost:3007 in 33 assets. If
 *      .env.local sets it to a deployed URL, all 33 silently retarget.
 *   2. The database an asset connects to and the application it drives are
 *      configured independently, and nothing asserts they agree. An asset can
 *      validate against one environment while mutating another.
 *
 * Both follow from inferring environment from one permissive indicator. This
 * module therefore resolves several independent signals and reports agreement,
 * disagreement and absence separately. Absence is not treated as assent.
 *
 * SECRET HANDLING
 * ---------------
 * This module reads .env.local, so it is careful about what it takes from it.
 * It extracts only the three non-secret discriminators it needs, and for
 * credentials it records PRESENCE ONLY — never a value. Nothing here returns,
 * logs or stores a secret. See docs/REPOSITORY-SAFETY-HARDENING-PLAN.md §8.2:
 * the guard must evaluate before a credential is read, not merely before it is
 * used.
 *
 * Phase 1 is ADVISORY. `describeEnvironment()` never throws and never exits, so
 * adopting it cannot disrupt an existing workflow. `assertSafeToExecute()` is
 * the fail-closed form, available for opt-in now and becoming the default in
 * Phase 2.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findAsset } from "./manifest.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

/** The only .env keys this module reads a VALUE from. None is a secret. */
const NON_SECRET_KEYS = new Set(["VYRON_ENV", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL", "PERMISSION_TEST_BASE"]);

/** Keys recorded as present/absent only. Values are never read. */
const CREDENTIAL_KEYS = {
  serviceRole: "SUPABASE_SERVICE_ROLE_KEY",
  anon: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  openai: "OPENAI_API_KEY",
  xeroClientId: "XERO_CLIENT_ID",
  xeroClientSecret: "XERO_CLIENT_SECRET",
};

export const ENVIRONMENTS = ["development", "pat", "staging", "production", "unknown"];

export function loadAllowlist() {
  try {
    return JSON.parse(readFileSync(path.join(HERE, "allowlist.json"), "utf8"));
  } catch (error) {
    return { version: 0, supabaseProjects: {}, applicationHosts: {}, externalTargets: {}, _error: String(error) };
  }
}

/**
 * Parse .env.local for the non-secret discriminators, plus presence flags.
 *
 * Precedence deliberately matches .tmp-fg-cert/certify-fg-export.mjs:20 — a
 * value already in process.env WINS. The 46 assets under scripts/ overwrite
 * unconditionally, which means an engineer cannot redirect them from the shell
 * and VYRON_ENV set in a terminal would be silently discarded. That would make
 * Signal 1 unusable, so this module does the opposite.
 */
export function readEnvironmentInputs(envFile = path.join(REPO_ROOT, ".env.local")) {
  const values = {};
  const present = new Set();
  let fileFound = false;

  try {
    const raw = readFileSync(envFile, "utf8");
    fileFound = true;
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      present.add(key);
      if (NON_SECRET_KEYS.has(key)) {
        values[key] = trimmed
          .slice(idx + 1)
          .trim()
          .replace(/^"|"$/g, "");
      }
    }
  } catch {
    fileFound = false;
  }

  // process.env wins over the file, for every key this module reads.
  for (const key of NON_SECRET_KEYS) {
    if (process.env[key]) values[key] = process.env[key];
  }

  const credentials = {};
  for (const [label, key] of Object.entries(CREDENTIAL_KEYS)) {
    credentials[label] = present.has(key) || Boolean(process.env[key]);
  }

  return { values, credentials, fileFound, envFile };
}

/**
 * Extract the Supabase project reference from a URL.
 *
 * Normalises the /rest/v1/ suffix that .env.local carries and .env.example:12
 * warns against — the malformed value that 47 assets each work around
 * independently. Returns null rather than guessing when the URL cannot be
 * parsed: an unparseable value must fail the signal, not fall through to a
 * bare-hostname comparison.
 */
export function extractSupabaseProjectRef(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  let host;
  try {
    host = new URL(cleaned).host;
  } catch {
    return null;
  }
  const match = /^([a-z0-9-]+)\.supabase\.(co|in|net)$/i.exec(host);
  return match ? match[1] : null;
}

export function extractHost(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

function signal(id, name, status, detail, environment = null, value = null) {
  return { id, name, status, detail, environment, value };
}

/**
 * Resolve the environment from all available signals.
 *
 * Never throws. Never exits. Returns a report; the caller decides what to do
 * with it.
 */
export function describeEnvironment(options = {}) {
  const allowlist = options.allowlist || loadAllowlist();
  const inputs = options.inputs || readEnvironmentInputs(options.envFile);
  const { values, credentials } = inputs;

  const signals = [];

  // ── Signal 1 — explicit declaration ────────────────────────────────────
  const declared = String(values.VYRON_ENV || "").trim().toLowerCase();
  if (!declared) {
    signals.push(signal("vyron-env", "Explicit declaration (VYRON_ENV)", "unresolved", "VYRON_ENV is not set."));
  } else if (!ENVIRONMENTS.includes(declared) || declared === "unknown") {
    signals.push(
      signal("vyron-env", "Explicit declaration (VYRON_ENV)", "invalid", `VYRON_ENV="${declared}" is not one of ${ENVIRONMENTS.slice(0, 4).join(", ")}.`, null, declared)
    );
  } else {
    signals.push(signal("vyron-env", "Explicit declaration (VYRON_ENV)", "resolved", `Declared as "${declared}".`, declared, declared));
  }

  // ── Signal 2 — database identity ───────────────────────────────────────
  const supabaseUrl = values.NEXT_PUBLIC_SUPABASE_URL || "";
  const projectRef = extractSupabaseProjectRef(supabaseUrl);
  if (!supabaseUrl) {
    signals.push(signal("supabase-project", "Database identity (Supabase project)", "unresolved", "NEXT_PUBLIC_SUPABASE_URL is not set."));
  } else if (!projectRef) {
    signals.push(
      signal("supabase-project", "Database identity (Supabase project)", "invalid", "NEXT_PUBLIC_SUPABASE_URL could not be parsed into a Supabase project reference.", null, supabaseUrl)
    );
  } else {
    const entry = allowlist.supabaseProjects?.[projectRef];
    if (!entry) {
      signals.push(
        signal("supabase-project", "Database identity (Supabase project)", "unlisted", `Project "${projectRef}" is not in scripts/safety/allowlist.json.`, null, projectRef)
      );
    } else if (entry.unresolved || entry.environment === "unknown") {
      signals.push(
        signal(
          "supabase-project",
          "Database identity (Supabase project)",
          "unresolved",
          `Project "${projectRef}" is listed but its environment is UNRESOLVED. See Hardening Plan Unknown 13.1.`,
          null,
          projectRef
        )
      );
    } else {
      signals.push(
        signal("supabase-project", "Database identity (Supabase project)", "resolved", `Project "${projectRef}" is allowlisted as ${entry.environment}.`, entry.environment, projectRef)
      );
    }
  }

  // ── Signal 3 — application target identity ─────────────────────────────
  const appUrl = values.NEXT_PUBLIC_APP_URL || values.PERMISSION_TEST_BASE || "";
  const appHost = extractHost(appUrl);
  if (!appUrl) {
    signals.push(
      signal(
        "app-target",
        "Application target identity",
        "unresolved",
        "NEXT_PUBLIC_APP_URL is not set. Note that 33 assets fall back to http://localhost:3007 when it is absent — the default is not a declaration."
      )
    );
  } else if (!appHost) {
    signals.push(signal("app-target", "Application target identity", "invalid", "NEXT_PUBLIC_APP_URL could not be parsed.", null, appUrl));
  } else {
    const entry = allowlist.applicationHosts?.[appHost];
    if (!entry) {
      signals.push(signal("app-target", "Application target identity", "unlisted", `Host "${appHost}" is not in scripts/safety/allowlist.json.`, null, appHost));
    } else {
      signals.push(
        signal("app-target", "Application target identity", "resolved", `Host "${appHost}" is allowlisted as ${entry.environment} (application tier only).`, entry.environment, appHost)
      );
    }
  }

  // ── Aggregate ──────────────────────────────────────────────────────────
  const resolved = signals.filter((s) => s.status === "resolved");
  const unresolved = signals.filter((s) => s.status !== "resolved");
  const distinct = [...new Set(resolved.map((s) => s.environment))];

  const disagreements = [];
  if (distinct.length > 1) {
    const parts = resolved.map((s) => `${s.name} => ${s.environment}`);
    disagreements.push(`Signals resolve to different environments: ${parts.join("; ")}.`);
  }

  // The specific cross-tier check the audit motivates: data tier vs app tier.
  const dbSignal = signals.find((s) => s.id === "supabase-project");
  const appSignal = signals.find((s) => s.id === "app-target");
  if (dbSignal?.status === "resolved" && appSignal?.status === "resolved" && dbSignal.environment !== appSignal.environment) {
    disagreements.push(
      `Split target: the database resolves to ${dbSignal.environment} while the application resolves to ${appSignal.environment}. An asset would validate against one environment and mutate the other.`
    );
  }

  let environment = "unknown";
  let confidence = "none";

  if (disagreements.length === 0 && distinct.length === 1) {
    environment = distinct[0];
    if (resolved.length >= 3) confidence = "high";
    else if (resolved.length === 2) confidence = "medium";
    else confidence = "low";
  }

  // Verified requires corroboration: a single signal is never enough.
  const verified = disagreements.length === 0 && (confidence === "medium" || confidence === "high");

  return {
    environment,
    verified,
    confidence,
    signals,
    disagreements,
    unresolved: unresolved.map((s) => `${s.name}: ${s.detail}`),
    resolvedCount: resolved.length,
    credentials,
    envFile: inputs.envFile,
    envFileFound: inputs.fileFound,
    allowlistVersion: allowlist.version ?? 0,
  };
}

/**
 * Combine the environment report with an asset's declared metadata to produce
 * a policy decision. Still advisory — returns a verdict, does not enforce.
 *
 * RULE 4 IS APPLIED AS SUBSTITUTION, NOT AS A SHORT CIRCUIT.
 * An unverified environment is evaluated AS Production rather than refused
 * outright. This matters: Family A is permitted in Production, so a read-only
 * schema probe stays runnable today, while a Family B write is correctly
 * prohibited by the same rule. Refusing everything uniformly would make the
 * tool useless and would teach engineers to ignore it.
 *
 * DATABASE IDENTITY IS MANDATORY FOR MUTATING ASSETS.
 * Two weak signals agreeing — a declared VYRON_ENV and a localhost app host —
 * must not authorise a write while the database is unidentified. The app host
 * describes the application tier only (see allowlist.json), and the audit
 * established that a local dev server can be pointed at any database. For any
 * asset whose mutation level is not "none", Signal 2 must be resolved.
 *
 * verdict: "permitted" | "requires-approval" | "prohibited" | "unregistered"
 */
export function evaluateExecution(assetReference, options = {}) {
  const report = options.report || describeEnvironment(options);
  const asset = findAsset(assetReference);

  if (!asset) {
    return {
      report,
      asset: null,
      effectiveEnvironment: "production",
      verdict: "unregistered",
      reasons: [
        `Asset "${assetReference}" is not in the safety register (scripts/safety/manifest.mjs). An unregistered asset is treated as unsafe, never as safe by default.`,
      ],
    };
  }

  const reasons = [];
  const ruleFourApplied = !report.verified;
  const effectiveEnvironment = report.verified ? report.environment : "production";

  if (asset.quarantined) {
    reasons.push(`QUARANTINED: ${asset.quarantine}`);
    return { report, asset, effectiveEnvironment, verdict: "prohibited", reasons };
  }

  if (ruleFourApplied) {
    reasons.push(
      `Environment is NOT verified (confidence: ${report.confidence}, ${report.resolvedCount} of 3 signals resolved). Hardening Plan Rule 4 applies: evaluated as PRODUCTION.`
    );
  }
  for (const item of report.disagreements) reasons.push(`DISAGREEMENT: ${item}`);

  const mutates = asset.mutation && asset.mutation !== "none";
  const dbSignal = report.signals.find((s) => s.id === "supabase-project");
  if (mutates && dbSignal?.status !== "resolved") {
    reasons.push(
      `Database identity is not resolved, and this asset mutates (${asset.mutation}). A mutating asset may not run against an unidentified database, however confident the other signals are.`
    );
    return { report, asset, effectiveEnvironment, verdict: "prohibited", reasons };
  }

  if (!asset.environments.includes(effectiveEnvironment)) {
    reasons.push(
      `Family ${asset.family} (${asset.risk}) is not permitted in ${effectiveEnvironment}. Permitted: ${asset.environments.join(", ") || "none"}.`
    );
    return { report, asset, effectiveEnvironment, verdict: "prohibited", reasons };
  }

  if (asset.requiresApproval) {
    reasons.push(`Family ${asset.family} requires a named approver per execution.`);
    if (asset.external?.length) {
      reasons.push(`External targets must be on the allowlist and declared in advance: ${asset.external.join(", ")}.`);
    }
    return { report, asset, effectiveEnvironment, verdict: "requires-approval", reasons };
  }

  if (effectiveEnvironment === "production" && asset.family === "A") {
    reasons.push("Read-only in Production: output must be redacted or aggregated. Do not print customer identifiers to a terminal or a log.");
  }

  return { report, asset, effectiveEnvironment, verdict: "permitted", reasons };
}

/**
 * Fail-closed form. Opt-in during Phase 1; the default from Phase 2.
 *
 * Deliberately has no bypass parameter. A bypass is used in exactly the
 * circumstances the guard exists for.
 */
export function assertSafeToExecute(assetReference, options = {}) {
  const decision = evaluateExecution(assetReference, options);
  if (decision.verdict === "permitted") return decision;

  const lines = [
    "",
    "REPOSITORY SAFETY PROGRAMME — EXECUTION REFUSED",
    `  Asset:       ${assetReference}`,
    `  Environment: ${decision.report.environment.toUpperCase()} (confidence: ${decision.report.confidence})`,
    `  Verdict:     ${decision.verdict.toUpperCase()}`,
    "",
    ...decision.reasons.map((r) => `  - ${r}`),
    "",
    "  Run `npm run safety:preflight -- <asset>` for the full signal breakdown.",
    "",
  ];
  process.stderr.write(`${lines.join("\n")}\n`);
  process.exit(1);
}
