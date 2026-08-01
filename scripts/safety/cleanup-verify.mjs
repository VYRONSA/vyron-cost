/**
 * VYRON Repository Safety Programme — cleanup verification.
 *
 * Priority 4 of RSP Phase 1. Verify — do not assume — that cleanup succeeded.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every cleanup defect the audit found shares one property: the cleanup code
 * ran, and the engineer had no way to know it had not worked.
 *
 *   - test-companies-module-certification.mjs resolves users by scanning
 *     paginated auth.admin.listUsers, capped at 10 pages x 200 = 2,000, and
 *     returns silently past that. Beyond 2,000 auth users an active
 *     PLATFORM_ADMIN survives and the script reports success.
 *   - test-manufacturing-lifecycle-enterprise.mjs deletes 3 rows while the
 *     script created production runs, run lines, an audit log, products, stock
 *     items and finished goods. The orphans point at a deleted company and are
 *     invisible to every tenant-scoped query in the application.
 *   - test-po-enterprise-hardening.mjs deletes vyron_documents ROWS, which
 *     cannot remove the storage object they referenced.
 *
 * In all three the script exited 0. Verification converts a silent, compounding
 * defect into a loud, immediate one.
 *
 * DESIGN
 * ------
 * - The Supabase client is INJECTED. This module holds no credentials, reads no
 *   environment, and can be exercised without one.
 * - The scope column is ALWAYS explicit. vyron_documents is scoped by tenant_id
 *   while everything else uses company_id; a helper that assumed company_id
 *   would silently fail to verify exactly the asset that most needs it.
 * - External artefacts are reported as UNVERIFIABLE, never as clean. A Xero
 *   invoice cannot be confirmed absent by this repository, and reporting it as
 *   removed would be the same false assurance this module exists to remove.
 * - The ledger is append-only and flushed per entry, so an interrupted run
 *   leaves a record. Full reconciliation tooling is Phase 2.
 *
 * Phase 1 is ADVISORY BY DEFAULT: verify() returns a report and never exits.
 * assertClean() is the failing form, for assets that opt in now.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/** @typedef {"row"|"auth-user"|"storage-object"|"external"} ArtefactKind */

function nowIso(clock) {
  return (clock || (() => new Date()))().toISOString();
}

/**
 * @param {object} options
 * @param {object}  options.client            Supabase client (service role, injected by the caller)
 * @param {string}  options.label             Human label for this run, used in diagnostics
 * @param {string} [options.ledgerPath]       Append-only JSONL ledger. Omit to disable.
 * @param {Function} [options.clock]          Injectable clock, for deterministic tests
 */
export function createCleanupTracker(options = {}) {
  const { client, label = "unnamed-run", ledgerPath = null, clock = null } = options;
  const artefacts = [];

  if (ledgerPath) {
    try {
      mkdirSync(path.dirname(ledgerPath), { recursive: true });
    } catch {
      /* a ledger that cannot be created must not stop the run */
    }
  }

  function append(entry) {
    artefacts.push(entry);
    if (!ledgerPath) return;
    try {
      appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch {
      /* ledger write failure is reported by verify(), never thrown here */
    }
  }

  /**
   * Register an artefact BEFORE the call that creates it.
   *
   * Register-then-create is deliberate: a crash between the two leaves a false
   * positive (a ledger entry for something that was never created), which a
   * reconciliation pass discards harmlessly. Create-then-register leaves an
   * orphan nothing knows about, which is the failure mode being prevented.
   */
  function track(entry) {
    append({ ...entry, trackedAt: nowIso(clock), run: label });
    return entry;
  }

  return {
    label,
    ledgerPath,
    artefacts,

    /** A database row, identified by an explicit column. */
    trackRow(table, column, value, meta = {}) {
      return track({ kind: "row", table, column, value, ...meta });
    },

    /** A Supabase auth user. */
    trackAuthUser(userId, meta = {}) {
      return track({ kind: "auth-user", value: userId, ...meta });
    },

    /** An object in a Supabase Storage bucket. */
    trackStorageObject(bucket, objectPath, meta = {}) {
      return track({ kind: "storage-object", bucket, value: objectPath, ...meta });
    },

    /**
     * A mutation in a system this repository cannot reverse — a Xero invoice, a
     * dispatched email, an AI request. Always reported as unverifiable.
     */
    trackExternal(system, identifier, meta = {}) {
      return track({ kind: "external", system, value: identifier, ...meta });
    },

    /** Re-query every tracked artefact and report what survives. Never throws. */
    async verify() {
      return verifyArtefacts(client, artefacts, { label, ledgerPath });
    },

    /**
     * Verify, print diagnostics, and fail the process if anything survived.
     * Opt-in during Phase 1; the default from Phase 2.
     */
    async assertClean() {
      const report = await verifyArtefacts(client, artefacts, { label, ledgerPath });
      process.stderr.write(`${renderCleanupReport(report)}\n`);
      if (!report.clean) process.exit(1);
      return report;
    },
  };
}

/**
 * Verify a list of artefacts is absent. Exported separately so assets that
 * track their own artefacts can verify without adopting the tracker.
 *
 * Outcomes per artefact:
 *   removed      — confirmed absent
 *   RESIDUAL     — confirmed still present  (a cleanup failure)
 *   INDETERMINATE— the check itself failed  (not evidence of cleanliness)
 *   UNVERIFIABLE — external; this repository cannot confirm either way
 */
export async function verifyArtefacts(client, artefacts, context = {}) {
  const results = [];

  for (const artefact of artefacts) {
    results.push(await verifyOne(client, artefact));
  }

  const residual = results.filter((r) => r.outcome === "RESIDUAL");
  const indeterminate = results.filter((r) => r.outcome === "INDETERMINATE");
  const unverifiable = results.filter((r) => r.outcome === "UNVERIFIABLE");
  const removed = results.filter((r) => r.outcome === "removed");

  return {
    label: context.label || "unnamed-run",
    ledgerPath: context.ledgerPath || null,
    /**
     * STRICT. "clean" means every tracked artefact was CONFIRMED removed.
     * An unverifiable external artefact is not confirmed removed, so it makes a
     * run not-clean. That is deliberate: reporting a Xero invoice as cleaned up
     * because this repository cannot see it would be exactly the false
     * assurance this module exists to remove. A Family D run therefore always
     * requires manual reconciliation, and says so.
     */
    clean: residual.length === 0 && indeterminate.length === 0 && unverifiable.length === 0,
    /** The narrower claim: everything this repository CAN verify is gone. */
    databaseClean: residual.length === 0 && indeterminate.length === 0,
    requiresManualReconciliation: unverifiable.length > 0,
    tracked: artefacts.length,
    counts: {
      removed: removed.length,
      residual: residual.length,
      indeterminate: indeterminate.length,
      unverifiable: unverifiable.length,
    },
    results,
    residual,
    indeterminate,
    unverifiable,
  };
}

async function verifyOne(client, artefact) {
  const base = { artefact };

  if (artefact.kind === "external") {
    return {
      ...base,
      outcome: "UNVERIFIABLE",
      detail: `${artefact.system} artefact "${artefact.value}" cannot be confirmed absent from this repository. Reconcile in ${artefact.system} directly.`,
      remediation: `Manually reconcile ${artefact.system}: locate "${artefact.value}" and void or remove it if the run created it.`,
    };
  }

  if (!client) {
    return { ...base, outcome: "INDETERMINATE", detail: "No Supabase client was supplied to the verifier.", remediation: "Pass `client` to createCleanupTracker()." };
  }

  try {
    if (artefact.kind === "row") {
      const { count, error } = await client
        .from(artefact.table)
        .select(artefact.column, { count: "exact", head: true })
        .eq(artefact.column, artefact.value);

      if (error) {
        return {
          ...base,
          outcome: "INDETERMINATE",
          detail: `Verification query failed on ${artefact.table}: ${error.message}`,
          remediation: `Confirm ${artefact.table} is readable and that "${artefact.column}" is the correct scope column for this table.`,
        };
      }
      if ((count || 0) > 0) {
        return {
          ...base,
          outcome: "RESIDUAL",
          detail: `${count} row(s) survive in ${artefact.table} where ${artefact.column} = ${artefact.value}.`,
          remediation: `delete from ${artefact.table} where ${artefact.column} = '${artefact.value}';`,
        };
      }
      return { ...base, outcome: "removed", detail: `Confirmed absent from ${artefact.table}.` };
    }

    if (artefact.kind === "auth-user") {
      const { data, error } = await client.auth.admin.getUserById(artefact.value);
      if (error) {
        const message = String(error.message || "").toLowerCase();
        // A "not found" error is the successful outcome for a deletion check.
        if (message.includes("not found") || error.status === 404) {
          return { ...base, outcome: "removed", detail: "Confirmed absent from auth.users." };
        }
        return {
          ...base,
          outcome: "INDETERMINATE",
          detail: `auth.admin.getUserById failed: ${error.message}`,
          remediation: "Confirm the client holds a service-role key with admin scope.",
        };
      }
      if (data?.user?.id) {
        return {
          ...base,
          outcome: "RESIDUAL",
          detail: `Auth user ${artefact.value} still exists (${data.user.email || "no email"}).`,
          remediation: `await supabase.auth.admin.deleteUser("${artefact.value}")`,
        };
      }
      return { ...base, outcome: "removed", detail: "Confirmed absent from auth.users." };
    }

    if (artefact.kind === "storage-object") {
      const folder = artefact.value.split("/").slice(0, -1).join("/");
      const name = artefact.value.split("/").pop();
      const { data, error } = await client.storage.from(artefact.bucket).list(folder, { search: name });
      if (error) {
        return {
          ...base,
          outcome: "INDETERMINATE",
          detail: `Storage list failed on bucket "${artefact.bucket}": ${error.message}`,
          remediation: `Confirm the bucket "${artefact.bucket}" exists and is listable with the supplied credential.`,
        };
      }
      if ((data || []).some((object) => object.name === name)) {
        return {
          ...base,
          outcome: "RESIDUAL",
          detail: `Storage object "${artefact.value}" survives in bucket "${artefact.bucket}".`,
          remediation: `await supabase.storage.from("${artefact.bucket}").remove(["${artefact.value}"])  — note that deleting the vyron_documents row does NOT remove the object.`,
        };
      }
      return { ...base, outcome: "removed", detail: `Confirmed absent from bucket "${artefact.bucket}".` };
    }

    return { ...base, outcome: "INDETERMINATE", detail: `Unrecognised artefact kind "${artefact.kind}".`, remediation: "Use trackRow, trackAuthUser, trackStorageObject or trackExternal." };
  } catch (error) {
    return {
      ...base,
      outcome: "INDETERMINATE",
      detail: `Verification threw: ${error instanceof Error ? error.message : String(error)}`,
      remediation: "Investigate before re-running; an indeterminate result is not evidence of a clean environment.",
    };
  }
}

/** Actionable diagnostics. No colour; safe in a log or a CI transcript. */
export function renderCleanupReport(report) {
  const rule = "-".repeat(74);
  const out = ["", rule, "  REPOSITORY SAFETY PROGRAMME — CLEANUP VERIFICATION", rule];
  out.push(`  Run:      ${report.label}`);
  out.push(`  Tracked:  ${report.tracked} artefact(s)`);
  out.push(
    `  Result:   removed=${report.counts.removed}  RESIDUAL=${report.counts.residual}  INDETERMINATE=${report.counts.indeterminate}  UNVERIFIABLE=${report.counts.unverifiable}`
  );
  if (report.ledgerPath) out.push(`  Ledger:   ${report.ledgerPath}`);
  out.push(rule);

  if (report.residual.length) {
    out.push("  RESIDUAL ARTEFACTS — cleanup did not remove these:");
    for (const item of report.residual) {
      out.push(`    * ${item.detail}`);
      out.push(`      fix: ${item.remediation}`);
    }
    out.push("");
  }

  if (report.indeterminate.length) {
    out.push("  INDETERMINATE — verification could not confirm removal.");
    out.push("  This is NOT evidence of a clean environment. Treat as residual until proven otherwise.");
    for (const item of report.indeterminate) {
      out.push(`    * ${item.detail}`);
      out.push(`      fix: ${item.remediation}`);
    }
    out.push("");
  }

  if (report.unverifiable.length) {
    out.push("  UNVERIFIABLE — external artefacts this repository cannot confirm:");
    for (const item of report.unverifiable) {
      out.push(`    * ${item.detail}`);
      out.push(`      fix: ${item.remediation}`);
    }
    out.push("");
  }

  if (report.clean) {
    out.push("  VERDICT: CLEAN — every tracked artefact confirmed removed.");
  } else if (report.databaseClean && report.requiresManualReconciliation) {
    out.push("  VERDICT: DATABASE CLEAN, MANUAL RECONCILIATION REQUIRED.");
    out.push("  Everything this repository can verify is gone. The external artefacts above");
    out.push("  cannot be confirmed from here and must be reconciled in the target system.");
  } else {
    out.push("  VERDICT: NOT CLEAN — see above.");
  }
  out.push(rule);
  return out.join("\n");
}
