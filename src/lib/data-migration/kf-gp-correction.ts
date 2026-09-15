/**
 * Kingdom Foods — historical Gross Profit correction (Family P data operation).
 *
 * WHAT THIS FIXES
 * ---------------
 * For 283 posted Kingdom Foods invoice lines the persisted cost_per_unit — the
 * historical cost snapshot the GP report reads as Cost of Sales — had been
 * stored equal to the selling price, so those invoices reported ~0% GP. The
 * cost the invoices SHOULD have captured was unavailable at the time. This
 * operation sets each such line's cost_per_unit to the current product standard
 * cost (product.total_cost) and recomputes the affected invoice headers.
 *
 * COST BASIS — READ THIS
 * ----------------------
 * The corrected cost is CURRENT_STANDARD_COST: a RECONSTRUCTION using today's
 * product cost. It is NOT, and must never be represented as, the original
 * invoice-time historical cost. Every audit row and the run record record the
 * basis explicitly.
 *
 * WHAT IT NEVER TOUCHES
 * ---------------------
 * Selling prices, quantities, VAT/tax fields, sales_value/revenue, product
 * master costs, BOMs, and any invoice, product or company outside the frozen
 * plan. The 11 exception lines (four uncosted products) are excluded by
 * construction — a line is only repairable when its product's total_cost > 0.
 *
 * DETERMINISM
 * -----------
 * buildKfGpCorrectionPlan is a pure function of the tenant's current rows. It
 * produces a canonical plan hash over the frozen inputs. The executor rebuilds
 * the plan from the live database immediately before writing and refuses unless
 * the hash still equals the approved value, so a plan approved against one state
 * can never be applied to a state that has since changed.
 *
 * Header totals are produced by the application's authoritative computeCostTotals
 * (imported from @/lib/vyron-invoice-cost-totals) — never a second rounding
 * algorithm.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { round2, computeCostTotals } from "@/lib/vyron-invoice-cost-totals";

/** The operational Kingdom Foods tenant (Handcrafted Food Products (Pty) Ltd). */
export const KF_COMPANY_ID = "851d2acb-b5c5-43a6-9dfb-f7df93c4ce2b";
/** The Supabase project proven to be live production (see production-supabase-db-is-pnb memory). */
export const KF_PRODUCTION_DB_REF = "pnbstrqsrfoubdgcgimi";
/** The hash approved in Phase 25. The executor refuses to write unless the live rebuild matches it. */
export const APPROVED_PLAN_HASH = "c9b44af558e8df62ef41a3eebb9669eddf0015c5d59b97c8c10c4deb7c92fab5";
/** The one basis this operation ever uses. Recorded on every write. */
export const COST_BASIS = "CURRENT_STANDARD_COST";
/** entity_type on the vyron_import_runs record; also the audit module_name. */
export const RUN_ENTITY_TYPE = "kf-gp-correction";
/** An invoice is in scope only if posted (its GP is reported). */
const POSTED_STATUSES = ["Posted", "Sent", "Paid"];

/** Equal to four decimals — cent-level equality that tolerates float noise. */
function eq4(a: number, b: number) {
  return Math.round(Number(a) * 10000) === Math.round(Number(b) * 10000);
}

export type KfInvoiceRecord = {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string; // YYYY-MM-DD
  company_id: string | null;
  sales_value: number;
  cost_value: number;
  gross_profit: number;
  gp_percentage: number;
  status: string | null;
  stock_posted: boolean;
};

export type KfLineRecord = {
  line_id: string;
  invoice_id: string;
  product_id: string | null;
  quantity: number;
  selling_price: number;
  cost_per_unit: number;
};

export type KfProductRecord = {
  id: string;
  product_name: string | null;
  sku: string | null;
  total_cost: number | null;
  company_id: string | null;
};

export type KfPlanLine = {
  line_id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  product_id: string | null;
  product_name: string | null;
  sku: string | null;
  quantity: number;
  selling_price: number;
  old_cost_per_unit: number; // rounded, for the record and the hash
  new_cost_per_unit: number; // rounded, for the record and the hash
  new_cost_per_unit_raw: number; // exact product.total_cost — what is written and summed
  cost_basis: typeof COST_BASIS;
  reconstruction: "RECONSTRUCTED / NOT HISTORICAL";
};

export type KfPlanHeader = {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  sales_value: number;
  old_cost_value: number;
  proposed_cost_value: number;
  old_gross_profit: number;
  proposed_gross_profit: number;
  old_gp_percentage: number;
  proposed_gp_percentage: number;
};

export type KfCorrectionPlan = {
  generated_at: string;
  company_id: string;
  company_name: string;
  cost_basis: typeof COST_BASIS;
  note: string;
  counts: {
    repairable_lines: number;
    other_lines_in_affected_invoices: number;
    affected_invoices: number;
    products: number;
  };
  month_cogs_reduction: Record<string, number>;
  plan_hash: string;
  problems: string[];
  plan: KfPlanLine[];
  invoiceHeaders: KfPlanHeader[];
};

/**
 * Build the deterministic correction plan from the tenant's current rows.
 *
 * The classification mirrors the approved Phase 25 forensic query exactly:
 *  - an invoice is AFFECTED when it is KF, posted, and has at least one line
 *    whose cost equals its selling price (both > 0) and whose product (matched
 *    by id AND company) has total_cost > 0;
 *  - within an affected invoice, a line is REPAIRABLE on the same test using the
 *    product matched by id; every other line keeps its current cost;
 *  - the corrected line cost is the product's current total_cost, flagged as a
 *    reconstruction, never the original historical cost.
 */
export function buildKfGpCorrectionPlan(
  input: { invoices: KfInvoiceRecord[]; lines: KfLineRecord[]; products: KfProductRecord[] },
  options: { companyId?: string; generatedAt?: string } = {}
): KfCorrectionPlan {
  const companyId = options.companyId || KF_COMPANY_ID;
  const productsById = new Map(input.products.map((p) => [p.id, p]));
  const linesByInvoice = new Map<string, KfLineRecord[]>();
  for (const l of input.lines) {
    const arr = linesByInvoice.get(l.invoice_id) || [];
    arr.push(l);
    linesByInvoice.set(l.invoice_id, arr);
  }

  const problems: string[] = [];

  // Cost of the product for a line, matched by id only (the outer-select join).
  const productCost = (l: KfLineRecord) => {
    const p = l.product_id ? productsById.get(l.product_id) : null;
    return { cost: Number(p?.total_cost || 0), company: p?.company_id ?? null, name: p?.product_name ?? null, sku: p?.sku ?? null };
  };
  // Cost when the product also belongs to the invoice's company (the CTE join).
  const productCostSameCompany = (l: KfLineRecord, invoiceCompany: string | null) => {
    const p = l.product_id ? productsById.get(l.product_id) : null;
    if (!p || p.company_id !== invoiceCompany) return 0;
    return Number(p.total_cost || 0);
  };
  const isPosted = (inv: KfInvoiceRecord) => Boolean(inv.stock_posted) || POSTED_STATUSES.includes(String(inv.status || ""));

  // Which invoices are affected? KF, posted, with ≥1 qualifying line (company-scoped product).
  const affected: KfInvoiceRecord[] = [];
  for (const inv of input.invoices) {
    if (inv.company_id !== companyId) continue;
    if (!isPosted(inv)) continue;
    const invLines = linesByInvoice.get(inv.invoice_id) || [];
    const qualifies = invLines.some(
      (l) => eq4(l.cost_per_unit, l.selling_price) && Number(l.selling_price) > 0 && productCostSameCompany(l, inv.company_id) > 0
    );
    if (qualifies) affected.push(inv);
  }

  const plan: KfPlanLine[] = [];
  const invoiceHeaders: KfPlanHeader[] = [];
  let repairable = 0;
  let otherLines = 0;

  for (const inv of affected) {
    const invLines = linesByInvoice.get(inv.invoice_id) || [];
    const sales = round2(inv.sales_value);

    // Sanity: the current cost recomputed from lines should match the stored header.
    const curCost = round2(invLines.reduce((s, l) => s + Number(l.quantity) * Number(l.cost_per_unit), 0));
    if (!eq4(curCost, round2(inv.cost_value)) && Math.abs(curCost - round2(inv.cost_value)) > 0.02) {
      problems.push(`invoice ${inv.invoice_number}: stored cost_value ${inv.cost_value} != recomputed current ${curCost}`);
    }

    // Corrected line set: repairable → raw product cost; others keep current cost.
    const correctedForHeader: { quantity: number; costPerUnit: number }[] = [];
    for (const l of invLines) {
      const pc = productCost(l);
      const isRepairable = eq4(l.cost_per_unit, l.selling_price) && Number(l.selling_price) > 0 && pc.cost > 0;
      const newRaw = isRepairable ? pc.cost : Number(l.cost_per_unit);
      correctedForHeader.push({ quantity: Number(l.quantity), costPerUnit: newRaw });
      if (isRepairable) {
        repairable += 1;
        if (pc.company !== companyId) {
          problems.push(`repairable line ${l.line_id}: product ${l.product_id} belongs to ${pc.company}, not ${companyId}`);
        }
        plan.push({
          line_id: l.line_id,
          invoice_id: inv.invoice_id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          product_id: l.product_id,
          product_name: pc.name,
          sku: pc.sku,
          quantity: Number(l.quantity),
          selling_price: round2(l.selling_price),
          old_cost_per_unit: round2(l.cost_per_unit),
          new_cost_per_unit: round2(pc.cost),
          new_cost_per_unit_raw: pc.cost,
          cost_basis: COST_BASIS,
          reconstruction: "RECONSTRUCTED / NOT HISTORICAL",
        });
      } else {
        otherLines += 1;
      }
    }

    // Header via the application's authoritative routine (invoice-level rounding).
    const totals = computeCostTotals(correctedForHeader, sales);
    invoiceHeaders.push({
      invoice_id: inv.invoice_id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      sales_value: sales,
      old_cost_value: round2(inv.cost_value),
      proposed_cost_value: totals.cost_value,
      old_gross_profit: round2(inv.gross_profit),
      proposed_gross_profit: totals.gross_profit,
      old_gp_percentage: round2(inv.gp_percentage),
      proposed_gp_percentage: totals.gp_percentage,
    });
  }

  // Month-level COGS reduction (repairable lines only), for reconciliation.
  const monthReduction: Record<string, number> = {};
  for (const row of plan) {
    const mon = row.invoice_date.slice(0, 7);
    monthReduction[mon] = (monthReduction[mon] || 0) + (round2(row.quantity * Number(row.old_cost_per_unit)) - round2(row.quantity * row.new_cost_per_unit_raw));
  }

  const plan_hash = canonicalPlanHash(companyId, plan, invoiceHeaders);

  return {
    generated_at: options.generatedAt || new Date().toISOString(),
    company_id: companyId,
    company_name: "Handcrafted Food Products (Pty) Ltd",
    cost_basis: COST_BASIS,
    note: "Reconstruction using the current product standard cost. This is NOT the original invoice-time historical cost.",
    counts: {
      repairable_lines: repairable,
      other_lines_in_affected_invoices: otherLines,
      affected_invoices: affected.length,
      products: new Set(plan.map((r) => r.product_id)).size,
    },
    month_cogs_reduction: Object.fromEntries(Object.entries(monthReduction).map(([m, v]) => [m, round2(v)])),
    plan_hash,
    problems,
    plan,
    invoiceHeaders,
  };
}

/**
 * The canonical hash of the frozen plan inputs. Its structure and key order are
 * fixed — changing them would invalidate the approved hash — so it is defined
 * here once and used by both the builder and any verifier.
 */
export function canonicalPlanHash(companyId: string, plan: KfPlanLine[], headers: KfPlanHeader[]): string {
  const frozenLines = plan
    .map((r) => ({ line_id: r.line_id, invoice_id: r.invoice_id, product_id: r.product_id, old: r.old_cost_per_unit, new: r.new_cost_per_unit, basis: r.cost_basis }))
    .sort((a, b) => a.line_id.localeCompare(b.line_id));
  const frozenHeaders = headers
    .map((h) => ({ invoice_id: h.invoice_id, old_cv: h.old_cost_value, new_cv: h.proposed_cost_value, old_gp: h.old_gross_profit, new_gp: h.proposed_gross_profit, old_gpp: h.old_gp_percentage, new_gpp: h.proposed_gp_percentage }))
    .sort((a, b) => a.invoice_id.localeCompare(b.invoice_id));
  const frozen = { company_id: companyId, cost_basis: COST_BASIS, lines: frozenLines, headers: frozenHeaders };
  return createHash("sha256").update(JSON.stringify(frozen)).digest("hex");
}

/* ────────────────────────────── reconciliation ──────────────────────────── */

export type KfReconciliation = {
  byMonth: Record<string, { revenue: number; oldCogs: number; newCogs: number; oldGp: number; newGp: number; oldGpPct: number; newGpPct: number }>;
  combined: { revenue: number; oldCogs: number; newCogs: number; oldGp: number; newGp: number; oldGpPct: number; newGpPct: number };
  gpIncrease: number;
};

/** Aggregate the plan's invoice headers by calendar month and combined, invoice-level. */
export function reconcilePlan(plan: KfCorrectionPlan): KfReconciliation {
  const byMonth: KfReconciliation["byMonth"] = {};
  let rev = 0, oldC = 0, newC = 0;
  for (const h of plan.invoiceHeaders) {
    const m = h.invoice_date.slice(0, 7);
    const b = (byMonth[m] ||= { revenue: 0, oldCogs: 0, newCogs: 0, oldGp: 0, newGp: 0, oldGpPct: 0, newGpPct: 0 });
    b.revenue = round2(b.revenue + h.sales_value);
    b.oldCogs = round2(b.oldCogs + h.old_cost_value);
    b.newCogs = round2(b.newCogs + h.proposed_cost_value);
    rev = round2(rev + h.sales_value);
    oldC = round2(oldC + h.old_cost_value);
    newC = round2(newC + h.proposed_cost_value);
  }
  for (const b of Object.values(byMonth)) {
    b.oldGp = round2(b.revenue - b.oldCogs);
    b.newGp = round2(b.revenue - b.newCogs);
    b.oldGpPct = b.revenue ? round2((b.oldGp / b.revenue) * 100) : 0;
    b.newGpPct = b.revenue ? round2((b.newGp / b.revenue) * 100) : 0;
  }
  const oldGp = round2(rev - oldC);
  const newGp = round2(rev - newC);
  return {
    byMonth,
    combined: {
      revenue: rev, oldCogs: oldC, newCogs: newC, oldGp, newGp,
      oldGpPct: rev ? round2((oldGp / rev) * 100) : 0,
      newGpPct: rev ? round2((newGp / rev) * 100) : 0,
    },
    gpIncrease: round2(newGp - oldGp),
  };
}

/* ────────────────────────────── execution ──────────────────────────────── */

export type KfLineResult = {
  line_id: string;
  invoice_id: string;
  invoice_number: string;
  status: "corrected" | "already-applied" | "conflict" | "not-found" | "foreign-company";
  old_cost_per_unit: number | null;
  new_cost_per_unit: number | null;
  detail?: string;
};

export type KfHeaderResult = {
  invoice_id: string;
  invoice_number: string;
  status: "updated" | "already-consistent" | "skipped" | "not-found" | "foreign-company";
  old: { cost_value: number; gross_profit: number; gp_percentage: number } | null;
  new: { cost_value: number; gross_profit: number; gp_percentage: number } | null;
  detail?: string;
};

export type KfExecutionReport = {
  runId: string;
  plan_hash: string;
  company_id: string;
  approver: string;
  status: "Completed" | "Completed with issues";
  counts: { corrected: number; alreadyApplied: number; conflicts: number; notFound: number; headersUpdated: number; headersSkipped: number };
  lineResults: KfLineResult[];
  headerResults: KfHeaderResult[];
  reversibility: {
    cost_basis: typeof COST_BASIS;
    lines: { line_id: string; invoice_id: string; product_id: string | null; old_cost_per_unit: number; new_cost_per_unit: number }[];
    headers: { invoice_id: string; old_cost_value: number; old_gross_profit: number; old_gp_percentage: number; new_cost_value: number; new_gross_profit: number; new_gp_percentage: number }[];
  };
};

type MinimalClient = Pick<SupabaseClient, "from">;

/**
 * Apply an already-approved, already-hash-verified plan to the live tenant.
 *
 * The caller (scripts/kf-gp-correction.mjs) is responsible for every safety gate
 * and for proving plan.plan_hash === the approved hash against the live state
 * BEFORE calling this. This function additionally refuses on company/hash
 * mismatch as defence in depth, and is fully idempotent and restartable: it
 * reads each line's live cost first and only writes a line still holding the old
 * cost; a line already at the new cost is recognised, not rewritten; a line at
 * neither value is a conflict that is recorded and left untouched.
 */
export async function executeKfGpCorrectionPlan(
  sb: MinimalClient,
  plan: KfCorrectionPlan,
  params: {
    companyId: string;
    approvedPlanHash: string;
    approval: { approver: string; acknowledgement: string };
    runId?: string;
    now?: string;
  }
): Promise<KfExecutionReport> {
  const companyId = params.companyId;
  const approver = params.approval.approver;
  const now = params.now || new Date().toISOString();
  if (plan.company_id !== companyId) throw new Error(`plan company ${plan.company_id} != ${companyId}`);
  if (companyId !== KF_COMPANY_ID) throw new Error(`refusing: company ${companyId} is not the Kingdom Foods tenant`);
  // The plan handed in must match the hash the caller approved. The CLI entrypoint
  // separately binds that approved hash to the frozen APPROVED_PLAN_HASH and
  // re-verifies it against a live rebuild before ever calling this — the two
  // together stop any write when the live state differs from the approval.
  if (plan.plan_hash !== params.approvedPlanHash) throw new Error(`plan hash ${plan.plan_hash} != approved ${params.approvedPlanHash}`);

  // Reuse an existing run record for this exact plan so a restart never creates a second.
  const runId = await resolveRunId(sb, companyId, plan.plan_hash, params.runId, now, approver);

  const lineResults: KfLineResult[] = [];
  const headerResults: KfHeaderResult[] = [];
  const reversibilityLines: KfExecutionReport["reversibility"]["lines"] = [];
  const reversibilityHeaders: KfExecutionReport["reversibility"]["headers"] = [];

  // Group the plan by invoice, so each invoice is owned-checked once and its header written once.
  const byInvoice = new Map<string, KfPlanLine[]>();
  for (const row of plan.plan) {
    const arr = byInvoice.get(row.invoice_id) || [];
    arr.push(row);
    byInvoice.set(row.invoice_id, arr);
  }

  for (const [invoiceId, rows] of byInvoice) {
    const invoiceNumber = rows[0].invoice_number;
    // Ownership: the invoice must belong to Kingdom Foods. Never touch a foreign row.
    const { data: inv, error: invErr } = await sb
      .from("vyron_customer_invoices")
      .select("id, company_id, sales_value")
      .eq("id", invoiceId)
      .maybeSingle();
    if (invErr) throw new Error(`reading invoice ${invoiceNumber}: ${invErr.message}`);
    if (!inv) {
      for (const r of rows) lineResults.push({ line_id: r.line_id, invoice_id: invoiceId, invoice_number: invoiceNumber, status: "not-found", old_cost_per_unit: null, new_cost_per_unit: null, detail: "invoice not found" });
      headerResults.push({ invoice_id: invoiceId, invoice_number: invoiceNumber, status: "not-found", old: null, new: null });
      continue;
    }
    if (inv.company_id !== companyId) {
      for (const r of rows) lineResults.push({ line_id: r.line_id, invoice_id: invoiceId, invoice_number: invoiceNumber, status: "foreign-company", old_cost_per_unit: null, new_cost_per_unit: null, detail: `invoice belongs to ${inv.company_id}` });
      headerResults.push({ invoice_id: invoiceId, invoice_number: invoiceNumber, status: "foreign-company", old: null, new: null });
      continue;
    }

    let invoiceHadIssue = false;
    for (const r of rows) {
      const { data: line, error: lineErr } = await sb
        .from("vyron_customer_invoice_lines")
        .select("id, invoice_id, cost_per_unit, selling_price, quantity")
        .eq("id", r.line_id)
        .eq("invoice_id", invoiceId)
        .maybeSingle();
      if (lineErr) throw new Error(`reading line ${r.line_id}: ${lineErr.message}`);
      if (!line) {
        invoiceHadIssue = true;
        lineResults.push({ line_id: r.line_id, invoice_id: invoiceId, invoice_number: invoiceNumber, status: "not-found", old_cost_per_unit: null, new_cost_per_unit: null, detail: "line not found" });
        continue;
      }
      const live = Number(line.cost_per_unit);
      const newRaw = r.new_cost_per_unit_raw;
      const oldRaw = Number(r.selling_price); // the defect stored cost == selling price

      if (eq4(live, newRaw)) {
        // Already corrected by this approved run — idempotent, no second write, ensure audit exists.
        await ensureLineAudit(sb, { runId, plan, row: r, invoiceNumber, oldCost: round2(r.old_cost_per_unit), newCost: newRaw, approver, now });
        lineResults.push({ line_id: r.line_id, invoice_id: invoiceId, invoice_number: invoiceNumber, status: "already-applied", old_cost_per_unit: round2(r.old_cost_per_unit), new_cost_per_unit: round2(newRaw) });
        reversibilityLines.push({ line_id: r.line_id, invoice_id: invoiceId, product_id: r.product_id, old_cost_per_unit: round2(r.old_cost_per_unit), new_cost_per_unit: round2(newRaw) });
        continue;
      }
      if (!eq4(live, oldRaw)) {
        // Neither old nor new — the world changed under us. Record, do not write.
        invoiceHadIssue = true;
        lineResults.push({ line_id: r.line_id, invoice_id: invoiceId, invoice_number: invoiceNumber, status: "conflict", old_cost_per_unit: round2(live), new_cost_per_unit: round2(newRaw), detail: `live cost ${live} is neither the planned old ${oldRaw} nor new ${newRaw}` });
        continue;
      }

      // Write the single field: cost_per_unit. Nothing else on the line is touched.
      const { error: updErr } = await sb
        .from("vyron_customer_invoice_lines")
        .update({ cost_per_unit: newRaw })
        .eq("id", r.line_id)
        .eq("invoice_id", invoiceId);
      if (updErr) throw new Error(`updating line ${r.line_id}: ${updErr.message}`);
      await ensureLineAudit(sb, { runId, plan, row: r, invoiceNumber, oldCost: oldRaw, newCost: newRaw, approver, now });
      lineResults.push({ line_id: r.line_id, invoice_id: invoiceId, invoice_number: invoiceNumber, status: "corrected", old_cost_per_unit: round2(oldRaw), new_cost_per_unit: round2(newRaw) });
      reversibilityLines.push({ line_id: r.line_id, invoice_id: invoiceId, product_id: r.product_id, old_cost_per_unit: round2(oldRaw), new_cost_per_unit: round2(newRaw) });
    }

    // Recompute the header from the invoice's CURRENT lines, via the authoritative routine.
    const planHeader = plan.invoiceHeaders.find((h) => h.invoice_id === invoiceId)!;
    const { data: currentLines, error: linesErr } = await sb
      .from("vyron_customer_invoice_lines")
      .select("quantity, cost_per_unit")
      .eq("invoice_id", invoiceId);
    if (linesErr) throw new Error(`reading lines of ${invoiceNumber}: ${linesErr.message}`);
    const sales = round2(Number(inv.sales_value));
    const totals = computeCostTotals((currentLines || []).map((l: { quantity: number; cost_per_unit: number }) => ({ quantity: l.quantity, costPerUnit: l.cost_per_unit })), sales);
    const oldHeader = { cost_value: planHeader.old_cost_value, gross_profit: planHeader.old_gross_profit, gp_percentage: planHeader.old_gp_percentage };
    const newHeader = { cost_value: totals.cost_value, gross_profit: totals.gross_profit, gp_percentage: totals.gp_percentage };

    if (invoiceHadIssue || !eq4(totals.cost_value, planHeader.proposed_cost_value)) {
      // The recomputed header does not match the approved plan (a line was in
      // conflict or missing). Do not write a header inconsistent with approval.
      headerResults.push({ invoice_id: invoiceId, invoice_number: invoiceNumber, status: "skipped", old: oldHeader, new: newHeader, detail: invoiceHadIssue ? "one or more lines were not corrected" : `recomputed cost_value ${totals.cost_value} != approved ${planHeader.proposed_cost_value}` });
      continue;
    }

    // Read the current header to decide updated vs already-consistent (idempotent).
    const { data: curHeader } = await sb
      .from("vyron_customer_invoices")
      .select("cost_value, gross_profit, gp_percentage")
      .eq("id", invoiceId)
      .maybeSingle();
    const alreadyConsistent = curHeader && eq4(Number(curHeader.cost_value), totals.cost_value) && eq4(Number(curHeader.gross_profit), totals.gross_profit) && eq4(Number(curHeader.gp_percentage), totals.gp_percentage);
    if (alreadyConsistent) {
      headerResults.push({ invoice_id: invoiceId, invoice_number: invoiceNumber, status: "already-consistent", old: oldHeader, new: newHeader });
    } else {
      const { error: hdrErr } = await sb
        .from("vyron_customer_invoices")
        .update({ cost_value: totals.cost_value, gross_profit: totals.gross_profit, gp_percentage: totals.gp_percentage })
        .eq("id", invoiceId)
        .eq("company_id", companyId);
      if (hdrErr) throw new Error(`updating header ${invoiceNumber}: ${hdrErr.message}`);
      headerResults.push({ invoice_id: invoiceId, invoice_number: invoiceNumber, status: "updated", old: oldHeader, new: newHeader });
    }
    reversibilityHeaders.push({ invoice_id: invoiceId, old_cost_value: oldHeader.cost_value, old_gross_profit: oldHeader.gross_profit, old_gp_percentage: oldHeader.gp_percentage, new_cost_value: newHeader.cost_value, new_gross_profit: newHeader.gross_profit, new_gp_percentage: newHeader.gp_percentage });
  }

  const counts = {
    corrected: lineResults.filter((r) => r.status === "corrected").length,
    alreadyApplied: lineResults.filter((r) => r.status === "already-applied").length,
    conflicts: lineResults.filter((r) => r.status === "conflict" || r.status === "foreign-company").length,
    notFound: lineResults.filter((r) => r.status === "not-found").length,
    headersUpdated: headerResults.filter((r) => r.status === "updated").length,
    headersSkipped: headerResults.filter((r) => r.status === "skipped" || r.status === "not-found" || r.status === "foreign-company").length,
  };
  const status: KfExecutionReport["status"] =
    counts.conflicts || counts.notFound || counts.headersSkipped ? "Completed with issues" : "Completed";

  const report: KfExecutionReport = {
    runId,
    plan_hash: plan.plan_hash,
    company_id: companyId,
    approver,
    status,
    counts,
    lineResults,
    headerResults,
    reversibility: { cost_basis: COST_BASIS, lines: reversibilityLines, headers: reversibilityHeaders },
  };

  // Persist / update the run record. Never a second row for the same plan hash.
  await finaliseRun(sb, runId, companyId, plan, report, params.approval, now);
  return report;
}

/** Find the existing run for this plan hash, or create one; returns its id. */
async function resolveRunId(sb: MinimalClient, companyId: string, planHash: string, preferred: string | undefined, now: string, approver: string): Promise<string> {
  const { data: existing } = await sb
    .from("vyron_import_runs")
    .select("id")
    .eq("company_id", companyId)
    .eq("entity_type", RUN_ENTITY_TYPE)
    .eq("file_name", planHash)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data: created, error } = await sb
    .from("vyron_import_runs")
    .insert({
      company_id: companyId,
      entity_type: RUN_ENTITY_TYPE,
      file_name: planHash,
      valid_rows: 0,
      rejected_rows: 0,
      status: "Running",
      error_report: { plan_hash: planHash, cost_basis: COST_BASIS, approver, started_at: now },
    })
    .select("id")
    .single();
  if (error) throw new Error(`creating run record: ${error.message}`);
  return created.id;
}

/** Insert one per-line audit row, unless this exact line already has one for this operation. */
async function ensureLineAudit(
  sb: MinimalClient,
  args: { runId: string; plan: KfCorrectionPlan; row: KfPlanLine; invoiceNumber: string; oldCost: number; newCost: number; approver: string; now: string }
) {
  const entityName = `${RUN_ENTITY_TYPE}:${args.row.line_id}`;
  const { data: existing } = await sb
    .from("vyron_cost_audit_logs")
    .select("id")
    .eq("module_name", RUN_ENTITY_TYPE)
    .eq("entity_name", entityName)
    .maybeSingle();
  if (existing?.id) return;
  const { error } = await sb.from("vyron_cost_audit_logs").insert({
    module_name: RUN_ENTITY_TYPE,
    action_type: "cost_correction",
    entity_name: entityName,
    old_value: { cost_per_unit: round2(args.oldCost) },
    new_value: {
      cost_per_unit: round2(args.newCost),
      cost_basis: COST_BASIS,
      reconstruction: "RECONSTRUCTED / NOT HISTORICAL",
      plan_hash: args.plan.plan_hash,
      run_id: args.runId,
      invoice_id: args.row.invoice_id,
      invoice_number: args.invoiceNumber,
      line_id: args.row.line_id,
      product_id: args.row.product_id,
    },
    user_name: args.approver,
  });
  if (error) throw new Error(`writing audit for line ${args.row.line_id}: ${error.message}`);
}

/** Write the final run status, counts and the complete reversibility record. */
async function finaliseRun(
  sb: MinimalClient,
  runId: string,
  companyId: string,
  plan: KfCorrectionPlan,
  report: KfExecutionReport,
  approval: { approver: string; acknowledgement: string },
  now: string
) {
  const { error } = await sb
    .from("vyron_import_runs")
    .update({
      valid_rows: report.counts.corrected + report.counts.alreadyApplied,
      rejected_rows: report.counts.conflicts + report.counts.notFound,
      status: report.status,
      error_report: {
        plan_hash: plan.plan_hash,
        run_id: runId,
        company_id: companyId,
        cost_basis: COST_BASIS,
        reconstruction: "RECONSTRUCTED / NOT HISTORICAL — current product standard cost, never the original historical cost",
        approver: approval.approver,
        acknowledgement: approval.acknowledgement,
        finished_at: now,
        counts: report.counts,
        reversibility: report.reversibility,
      },
    })
    .eq("id", runId)
    .eq("company_id", companyId);
  if (error) throw new Error(`finalising run record: ${error.message}`);
}
