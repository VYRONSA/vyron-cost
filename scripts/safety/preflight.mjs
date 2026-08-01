#!/usr/bin/env node
/**
 * VYRON Repository Safety Programme — preflight CLI.
 *
 * The Phase 1 entry point. It exists so the safety model delivers value with
 * ZERO changes to any validation asset: an engineer checks an asset before
 * running it, rather than the asset checking itself. Phase 2 moves the check
 * inside the assets; until then this is the adoption path that carries no
 * behavioural risk.
 *
 *   node scripts/safety/preflight.mjs <asset>     Banner + signals (advisory)
 *   node scripts/safety/preflight.mjs <asset> --gate   Exit 1 unless permitted
 *   node scripts/safety/preflight.mjs --env       Environment report only
 *   node scripts/safety/preflight.mjs --register  The full asset register
 *   node scripts/safety/preflight.mjs ... --json  Machine-readable output
 *
 * Advisory by default, per the Phase 1 directive: meaningfully safer without
 * disrupting existing engineering workflows. --gate is the fail-closed form for
 * CI and for wrappers.
 */

import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describeEnvironment, evaluateExecution } from "./environment.mjs";
import { renderBanner, renderSignals } from "./banner.mjs";
import { listAssets, familyCounts, RISK_BY_FAMILY } from "./manifest.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Directories scanned for executable assets, relative to the repository root. */
const ASSET_DIRECTORIES = ["scripts", ".tmp-fg-cert"];
const ASSET_EXTENSIONS = /\.(mjs|cjs|ts|ps1)$/i;

/**
 * Deliberately excluded from the register.
 *
 * scripts/safety/ IS the classifier. Classifying it inside its own register is
 * circular and adds no safety: the register exists so that validation assets
 * cannot execute unclassified, and the safety layer is not a validation asset.
 * The exclusion is named here, and reported by --verify-register, so that it
 * reads as a decision rather than an oversight.
 */
const EXCLUDED_DIRECTORIES = ["scripts/safety"];

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positional = argv.filter((a) => !a.startsWith("--"));

const asJson = flags.has("--json");
const gating = flags.has("--gate");

function out(text) {
  process.stdout.write(`${text}\n`);
}

function printRegister() {
  const assets = listAssets();
  const counts = familyCounts();

  if (asJson) {
    out(JSON.stringify({ counts, assets }, null, 2));
    return;
  }

  const rule = "-".repeat(96);
  out("");
  out("REPOSITORY SAFETY PROGRAMME — ASSET REGISTER");
  out(rule);
  out(`${"FAMILY".padEnd(8)}${"RISK".padEnd(16)}${"MUTATION".padEnd(13)}${"CLEANUP".padEnd(10)}${"EXTERNAL".padEnd(16)}ASSET`);
  out(rule);

  for (const family of ["A", "B", "C", "D", "tooling"]) {
    for (const asset of assets.filter((a) => a.family === family)) {
      const marker = asset.quarantined ? " [QUARANTINED]" : "";
      out(
        `${asset.family.padEnd(8)}${asset.risk.padEnd(16)}${String(asset.mutation).padEnd(13)}${String(asset.cleanup).padEnd(10)}${(asset.external.join(",") || "-").padEnd(16)}${asset.file}${marker}`
      );
    }
  }

  out(rule);
  out(
    `Totals — A: ${counts.A} (${RISK_BY_FAMILY.A})   B: ${counts.B} (${RISK_BY_FAMILY.B})   ` +
      `C: ${counts.C} (${RISK_BY_FAMILY.C})   D: ${counts.D} (${RISK_BY_FAMILY.D})   tooling: ${counts.tooling}`
  );
  out(`Validation assets: ${counts.A + counts.B + counts.C + counts.D}   Registered total: ${assets.length}`);
  out("");
  out("Classification rules:    docs/REPOSITORY-SAFETY-HARDENING-PLAN.md Part 2");
  out("Classification evidence: docs/TEST-INFRASTRUCTURE-AUDIT.md");
  out("");
}

function printEnvironment() {
  const report = describeEnvironment();
  if (asJson) {
    out(JSON.stringify(report, null, 2));
    return;
  }

  const rule = "-".repeat(74);
  out("");
  out(rule);
  out("  REPOSITORY SAFETY PROGRAMME — ENVIRONMENT REPORT");
  out(rule);
  out(`  Environment:  ${report.environment.toUpperCase()}`);
  out(`  Verified:     ${report.verified ? "YES" : "NO"}`);
  out(`  Confidence:   ${report.confidence}  (${report.resolvedCount}/3 signals resolved)`);
  out(`  Env file:     ${report.envFile}${report.envFileFound ? "" : "  (NOT FOUND)"}`);
  out(`  Allowlist:    scripts/safety/allowlist.json v${report.allowlistVersion}`);
  out(rule);
  out(renderSignals(report));

  if (report.disagreements.length) {
    out("  SIGNAL DISAGREEMENTS");
    for (const item of report.disagreements) out(`    ! ${item}`);
    out("");
  }

  if (!report.verified) {
    out("  Execution is NOT SAFE until the environment is verified.");
    out("  Hardening Plan Rule 4: an environment that cannot be proven is treated as Production.");
    out("");
  }
  out(rule);
  out("");
}

function preflightAsset(reference) {
  const decision = evaluateExecution(reference);

  if (asJson) {
    out(
      JSON.stringify(
        {
          asset: decision.asset,
          verdict: decision.verdict,
          reasons: decision.reasons,
          environment: {
            environment: decision.report.environment,
            verified: decision.report.verified,
            confidence: decision.report.confidence,
            disagreements: decision.report.disagreements,
            unresolved: decision.report.unresolved,
          },
        },
        null,
        2
      )
    );
  } else {
    out(renderBanner(decision, { assetReference: reference }));
    out(renderSignals(decision.report));
  }

  if (gating && decision.verdict !== "permitted") process.exit(1);
  return decision;
}

/**
 * Detect drift between the register and what is actually on disk.
 *
 * This is the Phase 1 merge gate: a new validation asset that has not been
 * classified is invisible to every other control in the programme, so the
 * population must not be allowed to regress silently while the backlog is
 * worked. Always exits non-zero on drift, regardless of --gate.
 */
function verifyRegister() {
  const registered = new Set(listAssets().map((a) => a.file));
  const onDisk = [];

  for (const dir of ASSET_DIRECTORIES) {
    let entries = [];
    try {
      entries = readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !ASSET_EXTENSIONS.test(entry.name)) continue;
      onDisk.push(`${dir}/${entry.name}`);
    }
  }

  const unregistered = onDisk.filter((f) => !registered.has(f));
  const missing = [...registered].filter((f) => !onDisk.includes(f));
  const ok = unregistered.length === 0 && missing.length === 0;

  if (asJson) {
    out(JSON.stringify({ ok, registered: registered.size, onDisk: onDisk.length, unregistered, missing }, null, 2));
  } else {
    const rule = "-".repeat(74);
    out("");
    out(rule);
    out("  REPOSITORY SAFETY PROGRAMME — REGISTER INTEGRITY");
    out(rule);
    out(`  Registered: ${registered.size}`);
    out(`  On disk:    ${onDisk.length}`);
    out(`  Scanned:    ${ASSET_DIRECTORIES.join(", ")}`);
    out(`  Excluded:   ${EXCLUDED_DIRECTORIES.join(", ")}  (the classifier is not a validation asset)`);
    out(rule);
    if (unregistered.length) {
      out("  UNREGISTERED — on disk but absent from the safety register:");
      for (const file of unregistered) out(`    * ${file}`);
      out("  Classify each in scripts/safety/manifest.mjs before it is executed.");
      out("");
    }
    if (missing.length) {
      out("  MISSING — registered but not found on disk:");
      for (const file of missing) out(`    * ${file}`);
      out("  Remove the register entry, or restore the file.");
      out("");
    }
    out(ok ? "  VERDICT: REGISTER COMPLETE — no drift." : "  VERDICT: REGISTER DRIFT — see above.");
    out(rule);
    out("");
  }

  if (!ok) process.exit(1);
}

function printUsage() {
  out("");
  out("VYRON Repository Safety Programme — preflight");
  out("");
  out("  node scripts/safety/preflight.mjs <asset>            Banner + signals (advisory)");
  out("  node scripts/safety/preflight.mjs <asset> --gate     Exit 1 unless permitted");
  out("  node scripts/safety/preflight.mjs --env              Environment report only");
  out("  node scripts/safety/preflight.mjs --register         Full asset register");
  out("  node scripts/safety/preflight.mjs --verify-register  Detect unclassified assets");
  out("  node scripts/safety/preflight.mjs ... --json         Machine-readable output");
  out("");
  out("  <asset> accepts an id, a bare filename, or a repo-relative path:");
  out("      test-permissions");
  out("      test-permissions.mjs");
  out("      scripts/test-permissions.mjs");
  out("");
  out("  Docs: scripts/safety/README.md");
  out("");
}

if (flags.has("--help") || flags.has("-h")) {
  printUsage();
} else if (flags.has("--verify-register")) {
  verifyRegister();
} else if (flags.has("--register")) {
  printRegister();
} else if (flags.has("--env")) {
  printEnvironment();
} else if (positional.length === 0) {
  printUsage();
  printEnvironment();
} else {
  preflightAsset(positional[0]);
}
