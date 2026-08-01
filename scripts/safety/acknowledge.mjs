/**
 * VYRON Repository Safety Programme — Family D acknowledgement.
 *
 * Phase 2, Priority 2. Controlled execution for Family D assets.
 *
 * GOAL: reduce ACCIDENTAL execution, not prevent AUTHORISED execution.
 *
 * No Family D asset is modified. The acknowledgement composes around it: the
 * operator is shown what the asset will do that cannot be undone, and must
 * reproduce a token that encodes the specific asset, the specific environment,
 * and the specific external systems involved.
 *
 * WHY A TYPED TOKEN RATHER THAN A y/n PROMPT
 * ------------------------------------------
 * A y/n prompt is answered reflexively and can be satisfied by a stray
 * keystroke or a piped `yes`. The token cannot be produced without reading the
 * banner, and it cannot be reused: it is bound to the asset AND the resolved
 * environment, so an acknowledgement typed for a PAT run does not authorise the
 * same asset against a different environment.
 *
 * This is a deliberate speed bump, not a security control. An engineer who
 * intends to run the asset can always do so — which is the stated goal.
 */

import { IRREVERSIBLE_OPERATIONS } from "./manifest.mjs";

/**
 * The token an operator must reproduce.
 * Deterministic, readable, and bound to asset + environment + external systems.
 *
 * e.g. RUN TMP-PRODUCT-OVERRIDES-ONLY-CERT AGAINST PAT WITH XERO
 */
export function acknowledgementToken(asset, environment) {
  const id = String(asset?.id || "unknown-asset").toUpperCase();
  const env = String(environment || "unknown").toUpperCase();
  const systems = (asset?.external || []).map((s) => String(s).toUpperCase()).join("+") || "NO-EXTERNAL";
  return `RUN ${id} AGAINST ${env} WITH ${systems}`;
}

/** Normalise for comparison — whitespace and case only. Nothing else is forgiven. */
function normalise(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/**
 * The four facts the directive requires an acknowledgement to state, plus the
 * irreversible operations that make this family different from every other.
 */
export function renderAcknowledgementRequest(asset, environment, options = {}) {
  const rule = "#".repeat(74);
  const token = acknowledgementToken(asset, environment);
  const irreversible = asset?.irreversible || IRREVERSIBLE_OPERATIONS[asset?.id] || [];

  const out = ["", rule, "  FAMILY D — EXPLICIT ACKNOWLEDGEMENT REQUIRED", rule];
  out.push(`  Asset:                    ${asset?.id || "(unregistered)"}`);
  out.push(`  Environment:              ${String(environment || "unknown").toUpperCase()}`);
  if (options.effectiveEnvironment && options.effectiveEnvironment !== environment) {
    out.push(`  Evaluated as:             ${String(options.effectiveEnvironment).toUpperCase()}  (Hardening Plan Rule 4)`);
  }
  out.push(`  Mutation capability:      ${String(asset?.mutation || "unknown").toUpperCase()}`);
  out.push(`  External integrations:    ${(asset?.external || []).map((s) => s.toUpperCase()).join(", ") || "NONE"}`);
  out.push(rule);

  if (irreversible.length) {
    out.push("  IRREVERSIBLE OPERATIONS — nothing in this repository can undo these:");
    out.push("");
    for (const operation of irreversible) {
      for (const line of wrapText(`* ${operation}`, 4, 70)) out.push(line);
    }
  } else {
    out.push("  No irreversible operations are recorded for this asset.");
    out.push("  Treat that as unknown, not as safe — record them in IRREVERSIBLE_OPERATIONS");
    out.push("  (scripts/safety/manifest.mjs) before running it.");
  }

  out.push("");
  out.push(rule);
  out.push("  To proceed, supply BOTH:");
  out.push("");
  out.push(`    --acknowledge "${token}"`);
  out.push("    --approver <name>");
  out.push("");
  out.push("  The token is bound to this asset AND this environment. An acknowledgement");
  out.push("  typed for one environment does not authorise another.");
  out.push(rule);
  return out.join("\n");
}

/**
 * Evaluate a supplied acknowledgement.
 * @returns {{ok: boolean, reason: string|null, token: string}}
 */
export function checkAcknowledgement(asset, environment, supplied, approver) {
  const token = acknowledgementToken(asset, environment);

  if (!supplied) {
    return { ok: false, reason: "No acknowledgement supplied.", token };
  }
  if (normalise(supplied) !== normalise(token)) {
    return {
      ok: false,
      reason: `Acknowledgement does not match. Expected exactly: "${token}"`,
      token,
    };
  }
  if (!approver || !String(approver).trim()) {
    return { ok: false, reason: "No --approver supplied. Family D requires a named approver per execution.", token };
  }
  return { ok: true, reason: null, token };
}

function wrapText(text, indent, limit) {
  const pad = " ".repeat(indent);
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
