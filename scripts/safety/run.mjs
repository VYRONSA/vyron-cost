#!/usr/bin/env node
/**
 * VYRON Repository Safety Programme — execution wrapper.
 *
 * Phase 2, Priority 1. Composes safety around an UNMODIFIED validation asset:
 *
 *   load manifest -> evaluate environment -> banner -> preflight
 *   -> acknowledgement (Family D) -> residue snapshot
 *   -> invoke the asset -> residue re-snapshot -> report
 *   -> return the asset's original exit code
 *
 *   node scripts/safety/run.mjs <asset> [-- <args passed to the asset>]
 *
 * DESIGN DECISIONS
 * ----------------
 * 1. THE ASSET IS NEVER MODIFIED, AND ITS BEHAVIOUR IS NEVER ALTERED.
 *    stdio is inherited, so the child's stdout/stderr/stdin are exactly as they
 *    would be if invoked directly. The banner and every safety message go to
 *    stderr — several tmp-*-cert assets emit machine-readable JSON on stdout.
 *
 * 2. THE ORIGINAL EXIT CODE IS RETURNED, VERBATIM.
 *    This is a contract requirement and it creates a real tension: a cleanup
 *    failure detected after a successful run cannot change the exit code
 *    without breaking that contract. The resolution is that cleanup failure is
 *    always LOUD (banner + report `status: FAIL`) but only becomes fatal under
 *    the explicit --strict-cleanup flag. The default honours the contract; the
 *    flag is there for CI, which is where a silent residue leak matters most.
 *
 * 3. RESIDUE VERIFICATION IS BLACK-BOX AND OPT-IN.
 *    Assets do not report what they created, so the wrapper counts rows
 *    matching each asset's known fixture pattern before and after. It requires
 *    --verify-cleanup and a constructible Supabase client. See residue.mjs for
 *    exactly what a zero delta does and does not prove.
 *
 * 4. THE WRAPPER ADDS NO BYPASS.
 *    There is no --force. A prohibited asset stays prohibited; the only path to
 *    running a Family D asset is the acknowledgement, which is a speed bump for
 *    accidents rather than a barrier to authorised work.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describeEnvironment, evaluateExecution, readEnvironmentInputs, extractSupabaseProjectRef } from "./environment.mjs";
import { renderBanner, renderSignals } from "./banner.mjs";
import { renderAcknowledgementRequest, checkAcknowledgement } from "./acknowledge.mjs";
import { snapshot, compare, renderResidueReport } from "./residue.mjs";
import { buildReport, summariseReport } from "./report.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** How each asset type is invoked. Deliberately explicit — no shell interpolation. */
const RUNNERS = {
  ".mjs": (file) => ({ command: process.execPath, args: [file] }),
  ".cjs": (file) => ({ command: process.execPath, args: [file] }),
  ".ts": (file) => ({ command: process.execPath, args: [file] }),
  ".ps1": (file) => ({ command: "powershell", args: ["-NoProfile", "-NonInteractive", "-File", file] }),
};

/**
 * Asset types the wrapper declines to invoke, with the reason.
 * Stated rather than attempted: a runner that silently half-works is worse than
 * one that refuses.
 */
const UNSUPPORTED = {
  ".ts": "The two .ts assets import via the '@/...' path alias, which Node's native type stripping does not resolve. No TypeScript runner is declared in package.json. Not verified to run under this wrapper.",
  ".ps1": "PowerShell assets are Windows-specific and both registered .ps1 files are quarantined or dead. Not supported by the wrapper in Phase 2.",
};

function err(text) {
  process.stderr.write(`${text}\n`);
}

function parseArgs(argv) {
  const separator = argv.indexOf("--");
  const own = separator === -1 ? argv : argv.slice(0, separator);
  const passthrough = separator === -1 ? [] : argv.slice(separator + 1);

  const flags = new Set();
  const options = {};
  const positional = [];

  for (let i = 0; i < own.length; i += 1) {
    const token = own[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const eq = token.indexOf("=");
    if (eq !== -1) {
      options[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const next = own[i + 1];
    if (next && !next.startsWith("--") && ["acknowledge", "approver", "report"].includes(token.slice(2))) {
      options[token.slice(2)] = next;
      i += 1;
      continue;
    }
    flags.add(token.slice(2));
  }

  return { flags, options, positional, passthrough };
}

function printUsage() {
  err("");
  err("VYRON Repository Safety Programme — execution wrapper");
  err("");
  err("  node scripts/safety/run.mjs <asset> [options] [-- <asset args>]");
  err("");
  err("  --dry-run              Run every safety step, but do not invoke the asset");
  err("  --verify-cleanup       Snapshot fixture residue before and after the run");
  err("  --strict-cleanup       Exit non-zero if cleanup verification fails");
  err("                         (default: the asset's own exit code is preserved)");
  err("  --report <path>        Write the machine-readable safety report to a file");
  err("  --json                 Print the safety report to stdout instead of a banner");
  err("  --acknowledge <token>  Family D acknowledgement token");
  err("  --approver <name>      Named approver, required for Family C and D");
  err("");
  err("  Docs: scripts/safety/README.md");
  err("");
}

async function buildSupabaseClient() {
  const { values } = readEnvironmentInputs();
  const url = String(values.NEXT_PUBLIC_SUPABASE_URL || "")
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || !extractSupabaseProjectRef(url)) return null;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(url, key, { auth: { persistSession: false } });
  } catch {
    return null;
  }
}

/** Spawn the asset, inheriting stdio so its behaviour is byte-for-byte unchanged. */
export function invokeAsset({ command, args, passthrough = [], cwd = REPO_ROOT, spawnFn = spawn }) {
  return new Promise((resolve) => {
    const child = spawnFn(command, [...args, ...passthrough], { cwd, stdio: "inherit" });
    child.on("error", (error) => resolve({ exitCode: 127, signal: null, error: error.message }));
    child.on("close", (code, signal) => resolve({ exitCode: code === null ? 1 : code, signal, error: null }));
  });
}

async function main() {
  const { flags, options, positional, passthrough } = parseArgs(process.argv.slice(2));

  if (flags.has("help") || positional.length === 0) {
    printUsage();
    process.exit(positional.length === 0 ? 1 : 0);
  }

  const assetReference = positional[0];
  const asJson = flags.has("json");
  const dryRun = flags.has("dry-run");
  const wantCleanup = flags.has("verify-cleanup");
  const strictCleanup = flags.has("strict-cleanup");

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  // ── 1. Manifest + environment + preflight ──────────────────────────────
  const report = describeEnvironment();
  const decision = evaluateExecution(assetReference, { report });
  const asset = decision.asset;

  if (!asJson) {
    err(renderBanner(decision, { assetReference }));
    err(renderSignals(report));
  }

  const finish = (outcome, exitCode, residue = null, acknowledgement = null) => {
    const finishedAt = new Date().toISOString();
    const safetyReport = buildReport({
      decision,
      assetReference,
      exitCode,
      residue,
      acknowledgement,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedMs,
      outcome,
    });

    if (options.report) {
      try {
        mkdirSync(path.dirname(path.resolve(REPO_ROOT, options.report)), { recursive: true });
        writeFileSync(path.resolve(REPO_ROOT, options.report), `${JSON.stringify(safetyReport, null, 2)}\n`, "utf8");
      } catch (error) {
        err(`  WARNING: could not write report: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (asJson) process.stdout.write(`${JSON.stringify(safetyReport, null, 2)}\n`);
    else err(`\n  SAFETY REPORT: ${summariseReport(safetyReport)}\n`);

    return safetyReport;
  };

  // ── 2. Preflight verdict ───────────────────────────────────────────────
  if (decision.verdict === "prohibited" || decision.verdict === "unregistered") {
    finish("blocked", null);
    process.exit(1);
  }

  // ── 3. Family D acknowledgement, and Family C approver ─────────────────
  let acknowledgement = null;

  if (decision.verdict === "requires-approval") {
    if (asset.family === "D") {
      const check = checkAcknowledgement(asset, decision.effectiveEnvironment, options.acknowledge, options.approver);
      if (!check.ok) {
        if (!asJson) {
          err(renderAcknowledgementRequest(asset, decision.effectiveEnvironment, { effectiveEnvironment: decision.effectiveEnvironment }));
          err(`  REFUSED: ${check.reason}`);
        }
        finish("blocked", null);
        process.exit(1);
      }
      acknowledgement = { approver: options.approver, token: check.token };
    } else if (!options.approver) {
      err(`  REFUSED: Family ${asset.family} requires --approver <name> per execution.`);
      finish("blocked", null);
      process.exit(1);
    } else {
      acknowledgement = { approver: options.approver, token: null };
    }
  }

  // ── 4. Runner resolution ───────────────────────────────────────────────
  const absolute = path.resolve(REPO_ROOT, asset.file);
  const extension = path.extname(asset.file).toLowerCase();
  const makeRunner = RUNNERS[extension];

  if (!makeRunner) {
    err(`  REFUSED: no runner is defined for "${extension}" assets.`);
    finish("blocked", null, null, acknowledgement);
    process.exit(1);
  }
  if (UNSUPPORTED[extension]) {
    err(`  REFUSED: ${UNSUPPORTED[extension]}`);
    err("  Invoke it directly if you have verified it runs, and record the result.");
    finish("blocked", null, null, acknowledgement);
    process.exit(1);
  }

  // ── 5. Residue snapshot (before) ───────────────────────────────────────
  let client = null;
  let before = [];
  const mutates = asset.mutation && asset.mutation !== "none";

  if (wantCleanup && mutates) {
    if (!asset.fixtures) {
      err("  NOTE: no fixture pattern is declared for this asset, so its cleanup cannot be verified.");
    } else {
      client = await buildSupabaseClient();
      if (!client) {
        err("  NOTE: cleanup verification requested, but no Supabase client could be constructed.");
      } else {
        before = await snapshot(client, asset.fixtures);
      }
    }
  }

  // ── 6. Dry run stops here ──────────────────────────────────────────────
  if (dryRun) {
    if (!asJson) err("  DRY RUN — every safety step completed; the asset was NOT invoked.");
    finish("dry-run", null, null, acknowledgement);
    process.exit(0);
  }

  // ── 7. Invoke ──────────────────────────────────────────────────────────
  const { command, args } = makeRunner(absolute);
  if (!asJson) err(`  INVOKING: ${path.basename(command)} ${asset.file}${passthrough.length ? ` ${passthrough.join(" ")}` : ""}\n`);

  const result = await invokeAsset({ command, args, passthrough });
  if (result.error) err(`\n  WRAPPER: failed to invoke asset — ${result.error}`);

  // ── 8. Residue snapshot (after) + comparison ───────────────────────────
  let residue = null;
  if (client && before.length) {
    const after = await snapshot(client, asset.fixtures);
    residue = compare(before, after);
    if (!asJson) err(renderResidueReport(residue, { asset: asset.id }));
  }

  // ── 9. Report and exit ─────────────────────────────────────────────────
  const safetyReport = finish("executed", result.exitCode, residue, acknowledgement);

  if (strictCleanup && safetyReport.cleanup === "NOT_VERIFIED") {
    err("  STRICT CLEANUP: cleanup verification failed; overriding the asset's exit code.");
    process.exit(1);
  }

  process.exit(result.exitCode);
}

/**
 * Only run when invoked directly. `invokeAsset` is imported by self-test.mjs to
 * verify exit-code preservation deterministically, and importing this module
 * must never start a wrapped execution as a side effect.
 */
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    err(`\n  WRAPPER ERROR: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exit(1);
  });
}
