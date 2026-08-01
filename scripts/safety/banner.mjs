/**
 * VYRON Repository Safety Programme — execution banner.
 *
 * Priority 1 of RSP Phase 1. Before execution begins, an operator must be able
 * to see the four facts that determine whether running an asset is safe:
 * environment, mutation level, authentication mode, and external integrations.
 *
 * DESIGN NOTES
 * ------------
 * 1. NO COLOUR. The banner is legible in a pipe, a log file, a CI transcript
 *    and a terminal with colour disabled. Severity is carried by words and by
 *    the box rule, never by an escape sequence.
 *
 * 2. STDERR, NOT STDOUT. Several assets emit JSON on stdout — the tmp-*-cert
 *    family prints a structured {module, runtimeStep, rootCause, exactFile,
 *    smallestFix} diagnostic that is meant to be machine-read. Writing the
 *    banner to stdout would corrupt it. The banner therefore goes to stderr,
 *    where it is visible to a human and invisible to a parser.
 *
 * 3. DERIVED, NOT AUTHORED. Every field comes from the register in manifest.mjs
 *    and the signals in environment.mjs. Nothing here is hand-maintained, so
 *    the banner cannot drift from the classification.
 */

const WIDTH = 74;

const RULE_BY_STATE = {
  safe: "-",
  caution: "=",
  danger: "#",
};

function line(char) {
  return char.repeat(WIDTH);
}

function row(label, value) {
  const key = `${label}:`.padEnd(26, " ");
  return `  ${key}${value}`;
}

function wrap(text, indent = 4) {
  const pad = " ".repeat(indent);
  const limit = WIDTH - indent;
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (current && `${current} ${word}`.length > limit) {
      lines.push(pad + current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(pad + current);
  return lines;
}

function authLabel(modes) {
  if (!modes || !modes.length) return "NONE";
  const map = {
    "service-role": "SERVICE ROLE",
    user: "AUTHENTICATED USER",
    "platform-admin": "PLATFORM ADMINISTRATOR",
    "system-integration": "SYSTEM INTEGRATION",
    "captured-session": "CAPTURED SESSION (committed credential)",
    anonymous: "ANONYMOUS",
    none: "NONE",
  };
  return modes.map((m) => map[m] || String(m).toUpperCase()).join(" + ");
}

function externalLabel(external) {
  if (!external || !external.length) return "NONE";
  return external.map((e) => String(e).toUpperCase()).join(", ");
}

function mutationLabel(mutation) {
  const map = {
    none: "NONE (read-only)",
    ephemeral: "EPHEMERAL (creates and removes its own data)",
    persistent: "PERSISTENT (leaves data behind)",
    external: "EXTERNAL (mutates systems this repository cannot reverse)",
    source: "SOURCE (rewrites repository files)",
  };
  return map[mutation] || String(mutation || "UNKNOWN").toUpperCase();
}

function cleanupLabel(cleanup) {
  const map = {
    "n/a": "NOT APPLICABLE",
    complete: "COMPLETE, BUT UNVERIFIED",
    partial: "PARTIAL — known to orphan rows it created",
    none: "NONE — leaves everything it creates",
    external: "CANNOT REVERSE ITS EXTERNAL EFFECTS",
  };
  return map[cleanup] || String(cleanup || "UNKNOWN").toUpperCase();
}

const VERDICT_TEXT = {
  permitted: "PERMITTED",
  "requires-approval": "REQUIRES NAMED APPROVER",
  prohibited: "PROHIBITED",
  unverified: "BLOCKED — ENVIRONMENT NOT VERIFIED",
  unregistered: "BLOCKED — ASSET NOT REGISTERED",
};

const VERDICT_STATE = {
  permitted: "safe",
  "requires-approval": "caution",
  prohibited: "danger",
  unverified: "danger",
  unregistered: "danger",
};

/**
 * Render the banner for an execution decision.
 * @param {object} decision result of evaluateExecution()
 * @param {object} [options] { assetReference }
 * @returns {string}
 */
export function renderBanner(decision, options = {}) {
  const { report, asset, verdict, reasons } = decision;
  const state = VERDICT_STATE[verdict] || "danger";
  const rule = line(RULE_BY_STATE[state]);
  const reference = options.assetReference || asset?.id || "(unknown asset)";

  const out = [];
  out.push("");
  out.push(rule);
  out.push("  REPOSITORY SAFETY PROGRAMME");
  out.push(rule);
  out.push(row("Asset", reference));

  if (asset) {
    out.push(row("Family", `${asset.familyLabel}`));
    out.push(row("Risk", asset.risk));
  } else {
    out.push(row("Family", "UNREGISTERED"));
    out.push(row("Risk", "UNKNOWN — treat as CRITICAL"));
  }

  out.push(row("Environment", `${report.environment.toUpperCase()}  (confidence: ${report.confidence}, ${report.resolvedCount}/3 signals resolved)`));
  if (decision.effectiveEnvironment && decision.effectiveEnvironment !== report.environment) {
    out.push(row("Evaluated as", `${decision.effectiveEnvironment.toUpperCase()}  (Hardening Plan Rule 4)`));
  }
  out.push(row("Mutation level", mutationLabel(asset?.mutation)));
  out.push(row("Authentication", authLabel(asset?.authentication)));
  out.push(row("External integrations", externalLabel(asset?.external)));
  out.push(row("Cleanup", cleanupLabel(asset?.cleanup)));
  out.push(rule);
  out.push(`  VERDICT: ${VERDICT_TEXT[verdict] || verdict.toUpperCase()}`);

  if (!report.verified) {
    out.push("");
    out.push("  Execution is NOT SAFE until the environment is verified.");
  }

  if (reasons?.length) {
    out.push("");
    for (const reason of reasons) out.push(...wrap(`- ${reason}`));
  }

  const blocking = report.disagreements || [];
  if (blocking.length) {
    out.push("");
    out.push("  SIGNAL DISAGREEMENTS");
    for (const item of blocking) out.push(...wrap(`! ${item}`));
  }

  out.push(rule);
  out.push("");
  return out.join("\n");
}

/**
 * Render the full signal breakdown. Used by preflight; available to any asset
 * that wants to show its operator why a verdict was reached.
 */
export function renderSignals(report) {
  const out = [];
  out.push("  ENVIRONMENT SIGNALS");
  out.push(`  ${line("-").slice(2)}`);
  for (const s of report.signals) {
    const status = s.status.toUpperCase().padEnd(11, " ");
    out.push(`  [${status}] ${s.name}`);
    out.push(...wrap(s.detail, 6));
  }
  out.push("");
  out.push("  CREDENTIALS IN SCOPE (presence only; no value is ever read)");
  for (const [label, present] of Object.entries(report.credentials || {})) {
    out.push(`    ${present ? "PRESENT" : "absent "}  ${label}`);
  }
  out.push("");
  return out.join("\n");
}

/** Write the banner to stderr. Never writes to stdout — see design note 2. */
export function printBanner(decision, options = {}) {
  process.stderr.write(`${renderBanner(decision, options)}\n`);
}
