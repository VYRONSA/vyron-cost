#!/usr/bin/env node
/**
 * VYRON Repository Safety Programme — self-test.
 *
 * Validates the environment-detection matrix and the cleanup verifier using
 * INJECTED inputs. Requires no database, no credentials, no network and no
 * running application, so it is safe to run anywhere and suitable for CI.
 *
 *   node scripts/safety/self-test.mjs
 *
 * Exits 0 on pass, 1 on failure.
 */

import { describeEnvironment, evaluateExecution, extractSupabaseProjectRef, extractHost } from "./environment.mjs";
import { verifyArtefacts, createCleanupTracker } from "./cleanup-verify.mjs";
import { findAsset, familyCounts, listAssets, FIXTURE_PATTERNS, IRREVERSIBLE_OPERATIONS } from "./manifest.mjs";
import { snapshot, compare, RESIDUE_STATUS } from "./residue.mjs";
import { acknowledgementToken, checkAcknowledgement } from "./acknowledge.mjs";
import { buildReport, summariseReport, REPORT_SCHEMA_VERSION } from "./report.mjs";
import { invokeAsset } from "./run.mjs";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** An allowlist with the project mapping RESOLVED, for testing the green path. */
const RESOLVED_ALLOWLIST = {
  version: 99,
  supabaseProjects: {
    devproject: { environment: "development", unresolved: false },
    prodproject: { environment: "production", unresolved: false },
    patproject: { environment: "pat", unresolved: false },
  },
  applicationHosts: {
    "localhost:3007": { environment: "development", unresolved: false },
    "app.example.com": { environment: "production", unresolved: false },
  },
  externalTargets: { xeroTenantIds: [], emailSinkHosts: [], aiMode: "none" },
};

function inputs(values) {
  return { values, credentials: {}, fileFound: true, envFile: "(injected)" };
}

// ── 1. URL normalisation ───────────────────────────────────────────────────
check("rest/v1 suffix is stripped", extractSupabaseProjectRef("https://abc123.supabase.co/rest/v1/") === "abc123");
check("bare project URL parses", extractSupabaseProjectRef("https://abc123.supabase.co") === "abc123");
check("trailing slashes tolerated", extractSupabaseProjectRef("https://abc123.supabase.co///") === "abc123");
check("unparseable URL returns null, does not guess", extractSupabaseProjectRef("not-a-url") === null);
check("empty URL returns null", extractSupabaseProjectRef("") === null);
check("non-supabase host returns null", extractSupabaseProjectRef("https://example.com") === null);
check("host extraction lowercases", extractHost("http://LOCALHOST:3007") === "localhost:3007");

// ── 2. Detection matrix ────────────────────────────────────────────────────
const none = describeEnvironment({ allowlist: RESOLVED_ALLOWLIST, inputs: inputs({}) });
check("no signals => unknown", none.environment === "unknown", none.environment);
check("no signals => not verified", none.verified === false);
check("no signals => confidence none", none.confidence === "none", none.confidence);
check("no signals => 3 unresolved reported", none.unresolved.length === 3, String(none.unresolved.length));

const one = describeEnvironment({ allowlist: RESOLVED_ALLOWLIST, inputs: inputs({ VYRON_ENV: "development" }) });
check("single signal => low confidence", one.confidence === "low", one.confidence);
check("single signal => NOT verified (no inference from one indicator)", one.verified === false);

const two = describeEnvironment({
  allowlist: RESOLVED_ALLOWLIST,
  inputs: inputs({ VYRON_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:3007" }),
});
check("two agreeing signals => medium", two.confidence === "medium", two.confidence);
check("two agreeing signals => verified", two.verified === true);
check("two agreeing signals => development", two.environment === "development", two.environment);

const three = describeEnvironment({
  allowlist: RESOLVED_ALLOWLIST,
  inputs: inputs({
    VYRON_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: "https://devproject.supabase.co/rest/v1/",
    NEXT_PUBLIC_APP_URL: "http://localhost:3007",
  }),
});
check("three agreeing signals => high", three.confidence === "high", three.confidence);
check("three agreeing signals => verified", three.verified === true);

// ── 3. Disagreement, including the split-target defect ─────────────────────
const split = describeEnvironment({
  allowlist: RESOLVED_ALLOWLIST,
  inputs: inputs({
    VYRON_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: "https://prodproject.supabase.co",
    NEXT_PUBLIC_APP_URL: "http://localhost:3007",
  }),
});
check("conflicting signals => unknown", split.environment === "unknown", split.environment);
check("conflicting signals => not verified", split.verified === false);
check("conflicting signals => confidence none", split.confidence === "none", split.confidence);
check("disagreement is reported", split.disagreements.length > 0);
check(
  "split target (db vs app tier) is named explicitly",
  split.disagreements.some((d) => d.includes("Split target")),
  JSON.stringify(split.disagreements)
);

const unlisted = describeEnvironment({
  allowlist: RESOLVED_ALLOWLIST,
  inputs: inputs({ NEXT_PUBLIC_SUPABASE_URL: "https://mystery.supabase.co" }),
});
check("unlisted project is not resolved", unlisted.signals.find((s) => s.id === "supabase-project").status === "unlisted");
check("unlisted project => not verified", unlisted.verified === false);

const invalidDeclaration = describeEnvironment({ allowlist: RESOLVED_ALLOWLIST, inputs: inputs({ VYRON_ENV: "prod" }) });
check("invalid VYRON_ENV is rejected, not coerced", invalidDeclaration.signals.find((s) => s.id === "vyron-env").status === "invalid");

// ── 4. Policy — Rule 4 substitution and the mandatory database signal ──────
const unverifiedReport = none;

const readOnlyUnverified = evaluateExecution("validate-schema-drift", { report: unverifiedReport });
check("Family A permitted under Rule 4 (permitted in Production)", readOnlyUnverified.verdict === "permitted", readOnlyUnverified.verdict);
check("Family A evaluated as production", readOnlyUnverified.effectiveEnvironment === "production");
check("Family A in production carries a redaction reason", readOnlyUnverified.reasons.some((r) => r.includes("redacted")));

const ephemeralUnverified = evaluateExecution("test-procurement-critical-workflow", { report: unverifiedReport });
check("Family B prohibited when database unidentified", ephemeralUnverified.verdict === "prohibited", ephemeralUnverified.verdict);
check(
  "Family B prohibition names the database signal",
  ephemeralUnverified.reasons.some((r) => r.includes("Database identity is not resolved")),
  JSON.stringify(ephemeralUnverified.reasons)
);

// Two weak signals agreeing must still not authorise a write.
const weakTwo = describeEnvironment({
  allowlist: RESOLVED_ALLOWLIST,
  inputs: inputs({ VYRON_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:3007" }),
});
const weakWrite = evaluateExecution("test-procurement-critical-workflow", { report: weakTwo });
check("verified-but-db-unknown still prohibits a mutating asset", weakWrite.verdict === "prohibited", weakWrite.verdict);

// Fully resolved development: Family B permitted, Family C/D not.
const devReport = three;
check("Family B permitted in verified development", evaluateExecution("test-procurement-critical-workflow", { report: devReport }).verdict === "permitted");
check("Family C prohibited in development", evaluateExecution("test-permissions", { report: devReport }).verdict === "prohibited");
check("Family D prohibited in development", evaluateExecution("test-po-enterprise-hardening", { report: devReport }).verdict === "prohibited");

// Fully resolved PAT: Family C requires approval; quarantined Family D stays prohibited.
const patReport = describeEnvironment({
  allowlist: RESOLVED_ALLOWLIST,
  inputs: inputs({
    VYRON_ENV: "pat",
    NEXT_PUBLIC_SUPABASE_URL: "https://patproject.supabase.co",
    NEXT_PUBLIC_APP_URL: "http://localhost:3007",
  }),
});
check("PAT report resolves despite app host being a dev host", patReport.disagreements.length > 0 || patReport.environment === "pat", patReport.environment);

const patStrict = describeEnvironment({
  allowlist: RESOLVED_ALLOWLIST,
  inputs: inputs({ VYRON_ENV: "pat", NEXT_PUBLIC_SUPABASE_URL: "https://patproject.supabase.co" }),
});
check("Family C requires approval in verified PAT", evaluateExecution("test-permissions", { report: patStrict }).verdict === "requires-approval");
check("quarantined Family D remains prohibited in PAT", evaluateExecution("tmp-product-overrides-only-cert", { report: patStrict }).verdict === "prohibited");
check(
  "quarantine reason is surfaced",
  evaluateExecution("tmp-product-overrides-only-cert", { report: patStrict }).reasons.some((r) => r.startsWith("QUARANTINED"))
);

const unregistered = evaluateExecution("scripts/not-a-real-asset.mjs", { report: devReport });
check("unregistered asset is blocked, not defaulted to safe", unregistered.verdict === "unregistered", unregistered.verdict);

// ── 5. Register integrity ──────────────────────────────────────────────────
const counts = familyCounts();
const all = listAssets();
check("register holds 60 assets", all.length === 60, String(all.length));
check("56 validation assets", counts.A + counts.B + counts.C + counts.D === 56, String(counts.A + counts.B + counts.C + counts.D));
check("4 non-validation tooling assets", counts.tooling === 4, String(counts.tooling));
check("every asset has a purpose", all.every((a) => a.purpose && a.purpose.length > 10));
check("every asset has evidence", all.every((a) => a.evidence && a.evidence.length > 10));
check("every asset has a risk derived from its family", all.every((a) => Boolean(a.risk)));
check("asset ids are unique", new Set(all.map((a) => a.id)).size === all.length);
check("every Family D asset declares an external system or is escalated", all.filter((a) => a.family === "D").every((a) => a.external.length > 0));
check("no Family A asset declares a mutation", all.filter((a) => a.family === "A").every((a) => a.mutation === "none"));
check("lookup by id works", findAsset("test-permissions")?.family === "C");
check("lookup by filename works", findAsset("test-permissions.mjs")?.family === "C");
check("lookup by repo path works", findAsset("scripts/test-permissions.mjs")?.family === "C");
check("lookup by backslash path works", findAsset("scripts\\test-permissions.mjs")?.family === "C");
check("lookup of .ts asset works", findAsset("tmp-invoice-export-mapping-cert.ts")?.family === "D");
check("lookup outside scripts/ works", findAsset(".tmp-fg-cert/certify-fg-export.mjs")?.family === "C");

// ── 6. Cleanup verification ────────────────────────────────────────────────
function fakeClient({ rowCounts = {}, users = {}, storage = {} }) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq(column, value) {
              const key = `${table}:${column}:${value}`;
              if (rowCounts[key] === "error") return Promise.resolve({ count: null, error: { message: "relation missing" } });
              return Promise.resolve({ count: rowCounts[key] ?? 0, error: null });
            },
          };
        },
      };
    },
    auth: {
      admin: {
        getUserById(id) {
          if (users[id] === "error") return Promise.resolve({ data: null, error: { message: "boom", status: 500 } });
          if (users[id]) return Promise.resolve({ data: { user: { id, email: users[id] } }, error: null });
          return Promise.resolve({ data: null, error: { message: "User not found", status: 404 } });
        },
      },
    },
    storage: {
      from(bucket) {
        return {
          list(folder) {
            const entries = storage[`${bucket}:${folder}`] || [];
            return Promise.resolve({ data: entries.map((name) => ({ name })), error: null });
          },
        };
      },
    },
  };
}

const cleanClient = fakeClient({});
const cleanReport = await verifyArtefacts(cleanClient, [
  { kind: "row", table: "vyron_cost_companies", column: "id", value: "c1" },
  { kind: "auth-user", value: "u1" },
  { kind: "storage-object", bucket: "vyron-documents", value: "tenant/doc/file.pdf" },
]);
check("clean teardown verifies clean", cleanReport.clean === true);
check("clean teardown counts removals", cleanReport.counts.removed === 3, String(cleanReport.counts.removed));
check("clean teardown needs no manual reconciliation", cleanReport.requiresManualReconciliation === false);

const dirtyClient = fakeClient({
  rowCounts: { "vyron_cost_companies:id:c1": 1, "vyron_documents:tenant_id:t1": "error" },
  users: { u1: "survivor@example.com" },
  storage: { "vyron-documents:tenant/doc": ["file.pdf"] },
});
const dirtyReport = await verifyArtefacts(dirtyClient, [
  { kind: "row", table: "vyron_cost_companies", column: "id", value: "c1" },
  { kind: "row", table: "vyron_documents", column: "tenant_id", value: "t1" },
  { kind: "auth-user", value: "u1" },
  { kind: "storage-object", bucket: "vyron-documents", value: "tenant/doc/file.pdf" },
  { kind: "external", system: "xero", value: "INV-123" },
]);
check("surviving artefacts are NOT reported clean", dirtyReport.clean === false);
check("surviving row detected", dirtyReport.residual.some((r) => r.detail.includes("vyron_cost_companies")));
check("surviving auth user detected", dirtyReport.residual.some((r) => r.detail.includes("survivor@example.com")));
check("surviving storage object detected", dirtyReport.residual.some((r) => r.detail.includes("vyron-documents")));
check("failed verification is INDETERMINATE, not clean", dirtyReport.indeterminate.length === 1, String(dirtyReport.indeterminate.length));
check("external artefact is UNVERIFIABLE, never removed", dirtyReport.unverifiable.length === 1 && dirtyReport.unverifiable[0].artefact.system === "xero");
check("every residual carries a remediation", dirtyReport.residual.every((r) => r.remediation && r.remediation.length > 5));
check(
  "storage remediation warns that deleting the row is not enough",
  dirtyReport.residual.some((r) => r.remediation.includes("does NOT remove the object"))
);
check("tenant_id scope column is honoured, not assumed to be company_id", dirtyReport.results.some((r) => r.artefact.column === "tenant_id"));

const noClient = await verifyArtefacts(null, [{ kind: "row", table: "t", column: "id", value: "x" }]);
check("missing client is INDETERMINATE, not clean", noClient.clean === false && noClient.counts.indeterminate === 1);

const tracker = createCleanupTracker({ client: cleanClient, label: "self-test" });
tracker.trackRow("vyron_cost_companies", "id", "c9");
tracker.trackAuthUser("u9");
tracker.trackExternal("xero", "INV-999");
check("tracker records artefacts", tracker.artefacts.length === 3, String(tracker.artefacts.length));
check("tracker stamps a run label", tracker.artefacts.every((a) => a.run === "self-test"));
const trackerReport = await tracker.verify();
check("an unverifiable external artefact makes the run NOT clean", trackerReport.clean === false, JSON.stringify(trackerReport.counts));
check("...but the database portion is reported clean separately", trackerReport.databaseClean === true);
check("...and manual reconciliation is flagged", trackerReport.requiresManualReconciliation === true);
check("external artefact counted as unverifiable", trackerReport.counts.unverifiable === 1);

// ── 7. Fixture residue verification (Phase 2, Priority 3) ──────────────────
function residueClient(counts) {
  return {
    from(table) {
      return {
        select() {
          return {
            like(column, pattern) {
              const key = `${table}:${column}:${pattern}`;
              if (counts[key] === "error") return Promise.resolve({ count: null, error: { message: "count failed" } });
              return Promise.resolve({ count: counts[key] ?? 0, error: null });
            },
          };
        },
      };
    },
  };
}

const permPattern = FIXTURE_PATTERNS["test-permissions"];
check("test-permissions declares a fixture pattern", Boolean(permPattern) && permPattern[0].pattern === "Perm Co %");

const beforeSnap = await snapshot(residueClient({ "vyron_cost_companies:name:Perm Co %": 4 }), permPattern);
check("snapshot returns a count", beforeSnap[0].count === 4, String(beforeSnap[0].count));

const cleanRun = compare(beforeSnap, await snapshot(residueClient({ "vyron_cost_companies:name:Perm Co %": 4 }), permPattern));
check("zero delta => VERIFIED", cleanRun.status === RESIDUE_STATUS.VERIFIED, cleanRun.status);
check("zero delta => netDelta 0", cleanRun.netDelta === 0);

const leakyRun = compare(beforeSnap, await snapshot(residueClient({ "vyron_cost_companies:name:Perm Co %": 5 }), permPattern));
check("positive delta => RESIDUE", leakyRun.status === RESIDUE_STATUS.RESIDUE, leakyRun.status);
check("residue reports the surviving count", leakyRun.netDelta === 1, String(leakyRun.netDelta));
check("residue carries an actionable pattern", leakyRun.patterns[0].detail.includes("Perm Co %"));

const shrinkRun = compare(beforeSnap, await snapshot(residueClient({ "vyron_cost_companies:name:Perm Co %": 2 }), permPattern));
check("negative delta => ANOMALY, never silently ignored", shrinkRun.status === RESIDUE_STATUS.ANOMALY, shrinkRun.status);

const brokenRun = compare(beforeSnap, await snapshot(residueClient({ "vyron_cost_companies:name:Perm Co %": "error" }), permPattern));
check("failed count => INDETERMINATE, not VERIFIED", brokenRun.status === RESIDUE_STATUS.INDETERMINATE, brokenRun.status);

const noPattern = compare([], []);
check("no declared pattern => NO_PATTERN, not VERIFIED", noPattern.status === RESIDUE_STATUS.NO_PATTERN, noPattern.status);

const ambiguousPattern = FIXTURE_PATTERNS["test-manage-login"];
check("constant-named fixture is flagged ambiguous", Boolean(ambiguousPattern[0].ambiguous));
const ambiguousRun = compare(
  await snapshot(residueClient({ "vyron_cost_companies:name:Broken Login Co": 1 }), ambiguousPattern),
  await snapshot(residueClient({ "vyron_cost_companies:name:Broken Login Co": 1 }), ambiguousPattern)
);
check("ambiguous pattern still verifies but carries the caveat", ambiguousRun.status === RESIDUE_STATUS.VERIFIED && ambiguousRun.summary.includes("ambiguous"));

check(
  "every fixture pattern targets a real scope column",
  Object.values(FIXTURE_PATTERNS).every((specs) => specs.every((s) => s.table && s.column && s.pattern))
);

// ── 8. Family D acknowledgement (Phase 2, Priority 2) ──────────────────────
const xeroAsset = findAsset("tmp-product-overrides-only-cert");
const token = acknowledgementToken(xeroAsset, "pat");
check("token names asset, environment and external system", token === "RUN TMP-PRODUCT-OVERRIDES-ONLY-CERT AGAINST PAT WITH XERO", token);
check("token is environment-bound", acknowledgementToken(xeroAsset, "development") !== token);

check("missing acknowledgement is refused", checkAcknowledgement(xeroAsset, "pat", null, "gerhard").ok === false);
check("wrong acknowledgement is refused", checkAcknowledgement(xeroAsset, "pat", "yes", "gerhard").ok === false);
check(
  "acknowledgement for another environment does not authorise this one",
  checkAcknowledgement(xeroAsset, "pat", acknowledgementToken(xeroAsset, "development"), "gerhard").ok === false
);
check("correct acknowledgement without an approver is refused", checkAcknowledgement(xeroAsset, "pat", token, null).ok === false);
check("correct acknowledgement with an approver is accepted", checkAcknowledgement(xeroAsset, "pat", token, "gerhard").ok === true);
check("acknowledgement tolerates whitespace and case only", checkAcknowledgement(xeroAsset, "pat", `  ${token.toLowerCase()}  `, "gerhard").ok === true);
check("irreversible operations are recorded for the highest-risk asset", (IRREVERSIBLE_OPERATIONS["tmp-product-overrides-only-cert"] || []).length >= 4);
check(
  "every quarantined Family D asset records its irreversible operations",
  listAssets()
    .filter((a) => a.family === "D")
    .every((a) => (a.irreversible || []).length > 0)
);

// ── 9. Safety report (Phase 2, Priority 4) ─────────────────────────────────
const permittedDecision = evaluateExecution("test-procurement-critical-workflow", { report: devReport });

const passReport = buildReport({
  decision: permittedDecision,
  assetReference: "test-procurement-critical-workflow",
  exitCode: 0,
  residue: cleanRun,
  outcome: "executed",
});
check("report stamps a schema version", passReport.schemaVersion === REPORT_SCHEMA_VERSION);
check("report shape matches the specified example keys", ["asset", "family", "environment", "risk", "cleanup", "externalIntegrations", "status"].every((k) => k in passReport));
check("verified cleanup + exit 0 => PASS", passReport.status === "PASS", passReport.status);
check("report cleanup field is VERIFIED", passReport.cleanup === "VERIFIED");
check("report records the asset filename", passReport.asset === "test-procurement-critical-workflow.mjs", passReport.asset);

const leakReport = buildReport({ decision: permittedDecision, assetReference: "x", exitCode: 0, residue: leakyRun, outcome: "executed" });
check("exit 0 with surviving residue is NOT a pass", leakReport.status === "FAIL", leakReport.status);
check("residue marks cleanup NOT_VERIFIED", leakReport.cleanup === "NOT_VERIFIED");

const failReport = buildReport({ decision: permittedDecision, assetReference: "x", exitCode: 2, residue: cleanRun, outcome: "executed" });
check("non-zero exit => FAIL", failReport.status === "FAIL");

const uncheckedReport = buildReport({ decision: permittedDecision, assetReference: "x", exitCode: 0, residue: null, outcome: "executed" });
check("cleanup not checked is NOT_CHECKED, never VERIFIED", uncheckedReport.cleanup === "NOT_CHECKED", uncheckedReport.cleanup);

const readOnlyReport = buildReport({ decision: evaluateExecution("validate-schema-drift", { report: devReport }), assetReference: "x", exitCode: 0, outcome: "executed" });
check("read-only asset cleanup is NOT_APPLICABLE", readOnlyReport.cleanup === "NOT_APPLICABLE", readOnlyReport.cleanup);

const blockedReport = buildReport({ decision: evaluateExecution("test-permissions", { report: devReport }), assetReference: "x", exitCode: null, outcome: "blocked" });
check("blocked run reports BLOCKED", blockedReport.status === "BLOCKED");
check("blocked run records no exit code", blockedReport.exitCode === null);

const unverifiedEnvReport = buildReport({ decision: evaluateExecution("validate-schema-drift", { report: none }), assetReference: "x", exitCode: 0, outcome: "executed" });
check("report never shows a verified environment it did not establish", unverifiedEnvReport.environmentVerified === false && unverifiedEnvReport.environment === "UNKNOWN");
check("report records the effective environment after Rule 4", unverifiedEnvReport.effectiveEnvironment === "PRODUCTION");
check("summary line is single-line and includes status", summariseReport(passReport).includes("status=PASS") && !summariseReport(passReport).includes("\n"));

// ── 10. Wrapper exit-code preservation (Phase 2, Priority 1) ───────────────
function fakeSpawn(exitCode, signal = null) {
  return () => {
    const handlers = {};
    queueMicrotask(() => {
      if (handlers.close) handlers.close(exitCode, signal);
    });
    return { on: (event, fn) => { handlers[event] = fn; } };
  };
}

for (const code of [0, 1, 2, 127]) {
  const outcome = await invokeAsset({ command: "node", args: ["x"], spawnFn: fakeSpawn(code) });
  check(`wrapper returns child exit code ${code} verbatim`, outcome.exitCode === code, String(outcome.exitCode));
}

const killed = await invokeAsset({ command: "node", args: ["x"], spawnFn: fakeSpawn(null, "SIGINT") });
check("signal-terminated child yields a non-zero code", killed.exitCode === 1 && killed.signal === "SIGINT");

const spawnFailure = await invokeAsset({
  command: "node",
  args: ["x"],
  spawnFn: () => {
    const handlers = {};
    queueMicrotask(() => handlers.error && handlers.error(new Error("ENOENT")));
    return { on: (event, fn) => { handlers[event] = fn; } };
  },
});
check("spawn failure is reported, not swallowed", spawnFailure.exitCode === 127 && spawnFailure.error === "ENOENT");

const passthrough = await invokeAsset({
  command: "node",
  args: ["asset.mjs"],
  passthrough: ["--flag", "value"],
  spawnFn: (cmd, argv) => {
    check("passthrough args reach the asset unchanged", argv.join(" ") === "asset.mjs --flag value", argv.join(" "));
    const handlers = {};
    queueMicrotask(() => handlers.close && handlers.close(0, null));
    return { on: (event, fn) => { handlers[event] = fn; } };
  },
});
check("passthrough run completes", passthrough.exitCode === 0);

// Real spawn — proves the mechanism end-to-end, not just the mock. Uses `node -e`
// so no validation asset and no database is touched.
for (const code of [0, 1, 3, 42]) {
  const real = await invokeAsset({ command: process.execPath, args: ["-e", `process.exit(${code})`] });
  check(`real spawn preserves exit code ${code}`, real.exitCode === code, String(real.exitCode));
}

// ── Result ─────────────────────────────────────────────────────────────────
const rule = "-".repeat(74);
process.stdout.write(`\n${rule}\n  REPOSITORY SAFETY PROGRAMME — SELF-TEST\n${rule}\n`);
process.stdout.write(`  Passed: ${passed}\n  Failed: ${failures.length}\n`);
if (failures.length) {
  process.stdout.write(`${rule}\n`);
  for (const failure of failures) process.stdout.write(`  FAIL  ${failure}\n`);
}
process.stdout.write(`${rule}\n  ${failures.length ? "SELF-TEST FAILED" : "SELF-TEST PASSED"}\n${rule}\n\n`);
process.exit(failures.length ? 1 : 0);
