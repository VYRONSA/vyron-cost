import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * PCP-045 — Developer Supervisor Reset Centre, server side only.
 *
 * Nothing in this module may be imported from a client component. The developer
 * supervisor password is never sent to the browser, never logged, and never
 * compared with a plain `===`.
 */

export const RESET_MODULES = [
  {
    key: "supplier_invoices",
    label: "Reset Supplier Invoices",
    summary: "Documents, invoice headers and lines, extraction results, review drafts, learning records and risk findings.",
  },
  {
    key: "raw_materials",
    label: "Reset Raw Materials",
    summary: "Ingredients, stock items, stock ledger and counts, price history and movements.",
  },
  {
    key: "finished_goods",
    label: "Reset Finished Goods",
    summary: "Products, finished goods, product cost lines, product intelligence and recipe links.",
  },
  {
    key: "boms",
    label: "Reset BOMs",
    summary: "BOM headers, BOM versions, BOM lines, recipes and recipe items.",
  },
  {
    key: "production_history",
    label: "Reset Production History",
    summary: "Production runs and lines, labour, overhead, wastage and the production audit trail.",
  },
  {
    key: "suppliers",
    label: "Reset Suppliers",
    summary: "Suppliers, supplier profiles and contracts, plus everything that references them.",
  },
  {
    key: "factory",
    label: "Factory Reset Costing",
    summary: "Every module above, in dependency order, in a single transaction.",
  },
] as const;

export type ResetModuleKey = (typeof RESET_MODULES)[number]["key"];

export function isResetModuleKey(value: unknown): value is ResetModuleKey {
  return RESET_MODULES.some((m) => m.key === value);
}

/* -------------------------------------------------------------- password */

const HASH_KEYLEN = 64;

/** Format: `scrypt$<saltHex>$<hashHex>`. Generate with scripts/generate-dev-reset-password-hash.mjs. */
export function hashDeveloperPassword(password: string, salt?: Buffer) {
  const s = salt ?? randomBytes(16);
  const hash = scryptSync(password, s, HASH_KEYLEN);
  return `scrypt$${s.toString("hex")}$${hash.toString("hex")}`;
}

export function isDeveloperResetPasswordConfigured() {
  return Boolean(String(process.env.VYRON_DEV_RESET_PASSWORD_HASH || "").trim());
}

/**
 * Constant-time verification against the configured hash. Returns false for any
 * malformed configuration rather than throwing, so failures never leak detail.
 */
export function verifyDeveloperPassword(candidate: string): boolean {
  const configured = String(process.env.VYRON_DEV_RESET_PASSWORD_HASH || "").trim();
  if (!configured || !candidate) return false;

  const parts = configured.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  let saltBuf: Buffer;
  let expected: Buffer;
  try {
    saltBuf = Buffer.from(parts[1], "hex");
    expected = Buffer.from(parts[2], "hex");
  } catch {
    return false;
  }
  if (!saltBuf.length || expected.length !== HASH_KEYLEN) return false;

  let actual: Buffer;
  try {
    actual = scryptSync(candidate, saltBuf, HASH_KEYLEN);
  } catch {
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ----------------------------------------------------------------- rpc */

export type ResetPreviewRow = { table_name: string; row_count: number };

export type ResetExecuteResult = {
  ok: boolean;
  module: string;
  company_id: string;
  rows_deleted: Record<string, number>;
  total_rows_deleted: number;
  duration_ms: number;
};

function requireAdminClient() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase service role is not configured. The reset centre cannot run.");
  }
  return supabase;
}

/** Read-only. Row counts a reset would remove, per table, for one company. */
export async function previewReset(companyId: string, moduleKey: ResetModuleKey): Promise<ResetPreviewRow[]> {
  const supabase = requireAdminClient();
  const { data, error } = await supabase.rpc("vyron_dev_reset_preview", {
    p_company_id: companyId,
    p_module: moduleKey,
  });
  if (error) throw new Error(`Preview failed: ${error.message}`);

  return ((data as ResetPreviewRow[] | null) || [])
    .map((row) => ({ table_name: String(row.table_name), row_count: Number(row.row_count) || 0 }))
    .filter((row) => row.row_count > 0)
    .sort((a, b) => b.row_count - a.row_count || a.table_name.localeCompare(b.table_name));
}

/** Destructive. One transaction inside Postgres. Writes its own audit row. */
export async function executeReset(input: {
  companyId: string;
  moduleKey: ResetModuleKey;
  actorUserId: string | null;
  actorEmail: string | null;
  reason: string | null;
  backupCreated: boolean;
  backupLocation: string | null;
  backupAcknowledgedWithout: boolean;
}): Promise<ResetExecuteResult> {
  const supabase = requireAdminClient();
  const { data, error } = await supabase.rpc("vyron_dev_reset_execute", {
    p_company_id: input.companyId,
    p_module: input.moduleKey,
    p_actor_user_id: input.actorUserId,
    p_actor_email: input.actorEmail,
    p_reason: input.reason,
    p_backup_created: input.backupCreated,
    p_backup_location: input.backupLocation,
    p_backup_acknowledged_without: input.backupAcknowledgedWithout,
  });
  if (error) throw new Error(`Reset failed: ${error.message}`);
  return data as ResetExecuteResult;
}

/** Headline tables the post-reset health check reports on, in the brief's order. */
export const VALIDATION_TABLES: Array<{ table: string; label: string }> = [
  { table: "vyron_finished_goods", label: "Finished Goods" },
  { table: "vyron_cost_products", label: "Products" },
  { table: "vyron_cost_boms", label: "BOMs" },
  { table: "vyron_cost_bom_lines", label: "BOM Lines" },
  { table: "vyron_cost_ingredients", label: "Ingredients" },
  { table: "vyron_cost_suppliers", label: "Suppliers" },
  { table: "vyron_cost_supplier_invoices", label: "Supplier Invoices" },
  { table: "vyron_cost_invoice_lines", label: "Invoice Lines" },
  { table: "vyron_cost_stock_items", label: "Stock Items" },
  { table: "vyron_cost_production_runs", label: "Production Runs" },
  { table: "vyron_cost_purchase_orders", label: "Purchase Orders" },
  { table: "vyron_cost_goods_receipts", label: "Goods Receipts" },
];

/**
 * Post-reset validation. Re-reads the module scope rather than trusting the
 * delete result, and reports any table still holding rows.
 */
export async function validateCleanState(companyId: string, moduleKey: ResetModuleKey) {
  const remaining = await previewReset(companyId, moduleKey);
  const remainingByTable = new Map(remaining.map((r) => [r.table_name, r.row_count]));

  const headline = VALIDATION_TABLES.map((v) => ({
    label: v.label,
    table: v.table,
    rows: remainingByTable.get(v.table) ?? 0,
  }));

  return {
    clean: remaining.length === 0,
    headline,
    remaining,
    orphanRecords: remaining.reduce((sum, r) => sum + r.row_count, 0),
  };
}

/** Confirms the company exists and returns its display name for the confirmation UI. */
export async function resolveCompanyForReset(companyId: string) {
  const supabase = requireAdminClient();
  const { data, error } = await supabase
    .from("vyron_cost_companies")
    .select("id, name, trading_name")
    .eq("id", companyId)
    .maybeSingle();

  if (error) throw new Error(`Company lookup failed: ${error.message}`);
  if (!data) throw new Error("Unknown company. The reset centre will not operate on an unrecognised tenant.");

  return {
    id: String(data.id),
    name: String(data.name || ""),
    tradingName: String(data.trading_name || ""),
  };
}

/** Recent reset history for the audit panel. */
export async function listResetAudit(companyId: string, limit = 20) {
  const supabase = requireAdminClient();
  const { data, error } = await supabase
    .from("vyron_dev_reset_audit")
    .select("id, module, actor_email, reason, total_rows_deleted, duration_ms, status, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data || [];
}
