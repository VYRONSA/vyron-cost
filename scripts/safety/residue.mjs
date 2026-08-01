/**
 * VYRON Repository Safety Programme — fixture residue verification.
 *
 * Phase 2, Priority 3. Verify whether an asset's EXISTING cleanup succeeded,
 * without modifying the asset and without redesigning its cleanup.
 *
 * HOW IT WORKS
 * ------------
 * Every ephemeral-tenant asset names the company it creates with a literal
 * prefix — "Perm Co ", "Proc Test ", "Warehouse Cert ", and so on. Those
 * prefixes are recorded in manifest.mjs FIXTURE_PATTERNS, read directly out of
 * each asset's `.insert({ name: ... })` call.
 *
 * The wrapper counts matching rows before the asset runs and again after it
 * exits. A non-zero delta means the asset created tenants it did not remove.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT
 * --------------------------------------
 * This is a black-box check on an unmodified asset, so it is deliberately
 * modest about its claims:
 *
 *   - A POSITIVE delta is strong evidence of a cleanup failure.
 *   - A ZERO delta is NOT proof of a clean run. It shows no tenant survived
 *     under the known pattern. It says nothing about orphaned child rows whose
 *     parent company was deleted — the exact defect in
 *     test-manufacturing-lifecycle-enterprise — because those rows are no
 *     longer reachable from any pattern once the company is gone.
 *   - A NEGATIVE delta means rows disappeared that this run did not create;
 *     reported as an anomaly, never silently ignored.
 *
 * The report says which of these applies. It never reports "VERIFIED" for a
 * check that cannot support the claim — that would reproduce the false
 * assurance the whole programme exists to remove.
 *
 * The Supabase client is INJECTED. This module holds no credentials and reads
 * no environment.
 */

/** Outcome of a residue comparison. */
export const RESIDUE_STATUS = {
  VERIFIED: "VERIFIED",
  RESIDUE: "RESIDUE",
  ANOMALY: "ANOMALY",
  INDETERMINATE: "INDETERMINATE",
  NOT_APPLICABLE: "NOT_APPLICABLE",
  NO_PATTERN: "NO_PATTERN",
};

/**
 * Count rows matching each declared fixture pattern.
 * Returns { table, column, pattern, count, error } per pattern.
 */
export async function snapshot(client, patterns) {
  if (!patterns || !patterns.length) return [];
  const rows = [];

  for (const spec of patterns) {
    if (!client) {
      rows.push({ ...spec, count: null, error: "No Supabase client supplied." });
      continue;
    }
    try {
      const { count, error } = await client
        .from(spec.table)
        .select(spec.column, { count: "exact", head: true })
        .like(spec.column, spec.pattern);

      if (error) {
        rows.push({ ...spec, count: null, error: error.message });
      } else {
        rows.push({ ...spec, count: Number(count || 0), error: null });
      }
    } catch (error) {
      rows.push({ ...spec, count: null, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return rows;
}

/**
 * Compare a before/after pair of snapshots.
 *
 * @param {Array} before
 * @param {Array} after
 * @returns {{status: string, summary: string, patterns: Array, netDelta: number}}
 */
export function compare(before, after) {
  if (!before?.length && !after?.length) {
    return { status: RESIDUE_STATUS.NO_PATTERN, summary: "No fixture pattern is declared for this asset, so its cleanup cannot be verified.", patterns: [], netDelta: 0 };
  }

  const patterns = [];
  let netDelta = 0;
  let anyError = false;
  let anyAmbiguous = false;

  for (let i = 0; i < after.length; i += 1) {
    const a = after[i];
    const b = before[i] || { count: null };

    if (a.error || b.error || a.count === null || b.count === null) {
      anyError = true;
      patterns.push({
        table: a.table,
        column: a.column,
        pattern: a.pattern,
        before: b.count,
        after: a.count,
        delta: null,
        outcome: RESIDUE_STATUS.INDETERMINATE,
        detail: a.error || b.error || "A count could not be established.",
      });
      continue;
    }

    const delta = a.count - b.count;
    netDelta += delta;
    if (a.ambiguous) anyAmbiguous = true;

    let outcome = RESIDUE_STATUS.VERIFIED;
    let detail = `No surviving rows matching "${a.pattern}" (before ${b.count}, after ${a.count}).`;

    if (delta > 0) {
      outcome = RESIDUE_STATUS.RESIDUE;
      detail = `${delta} row(s) survive in ${a.table} matching "${a.pattern}" (before ${b.count}, after ${a.count}).`;
    } else if (delta < 0) {
      outcome = RESIDUE_STATUS.ANOMALY;
      detail = `${Math.abs(delta)} row(s) matching "${a.pattern}" disappeared during this run but were not created by it (before ${b.count}, after ${a.count}).`;
    } else if (a.ambiguous) {
      detail = `${detail} CAVEAT: ${a.ambiguous}`;
    }

    patterns.push({ table: a.table, column: a.column, pattern: a.pattern, before: b.count, after: a.count, delta, outcome, detail, ambiguous: a.ambiguous || null });
  }

  const hasResidue = patterns.some((p) => p.outcome === RESIDUE_STATUS.RESIDUE);
  const hasAnomaly = patterns.some((p) => p.outcome === RESIDUE_STATUS.ANOMALY);

  let status = RESIDUE_STATUS.VERIFIED;
  let summary = "Every declared fixture pattern returned to its pre-run count.";

  if (anyError) {
    status = RESIDUE_STATUS.INDETERMINATE;
    summary = "One or more residue counts could not be established. This is NOT evidence of a clean run.";
  } else if (hasResidue) {
    status = RESIDUE_STATUS.RESIDUE;
    summary = `Cleanup did not remove everything: net ${netDelta} row(s) survive.`;
  } else if (hasAnomaly) {
    status = RESIDUE_STATUS.ANOMALY;
    summary = "Rows disappeared that this run did not create. Investigate before trusting this result.";
  } else if (anyAmbiguous) {
    summary = `${summary} One or more patterns are ambiguous — see the caveat below.`;
  }

  return { status, summary, patterns, netDelta };
}

/**
 * The caveat that must accompany every VERIFIED result. Stated in full because
 * a partial-cleanup asset can pass this check while still orphaning child rows.
 */
export const VERIFIED_CAVEAT =
  "A zero delta shows no tenant survived under the known fixture pattern. It does NOT prove the run was clean: " +
  "orphaned child rows whose parent company was deleted are unreachable from any pattern and are not detected by this check.";

/** Human-readable residue report. No colour; safe in a log or CI transcript. */
export function renderResidueReport(result, options = {}) {
  const rule = "-".repeat(74);
  const out = ["", rule, "  REPOSITORY SAFETY PROGRAMME — CLEANUP VERIFICATION (fixture residue)", rule];
  if (options.asset) out.push(`  Asset:   ${options.asset}`);
  out.push(`  Status:  ${result.status}`);
  out.push(`  Summary: ${result.summary}`);
  out.push(rule);

  if (!result.patterns.length) {
    out.push("  No fixture pattern declared. Add one to FIXTURE_PATTERNS in scripts/safety/manifest.mjs");
    out.push("  to make this asset's cleanup verifiable.");
    out.push(rule);
    return out.join("\n");
  }

  for (const p of result.patterns) {
    out.push(`  [${p.outcome}] ${p.table}.${p.column} LIKE "${p.pattern}"`);
    out.push(`      ${p.detail}`);
    if (p.outcome === RESIDUE_STATUS.RESIDUE) {
      out.push(`      fix: select id, ${p.column} from ${p.table} where ${p.column} like '${p.pattern}';`);
    }
  }

  out.push("");
  if (result.status === RESIDUE_STATUS.VERIFIED) {
    out.push("  CAVEAT");
    for (const line of wrapText(VERIFIED_CAVEAT, 4, 70)) out.push(line);
  }
  out.push(rule);
  return out.join("\n");
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
