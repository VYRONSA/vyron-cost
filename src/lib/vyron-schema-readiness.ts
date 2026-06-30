import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";

export type SchemaTableCheck = {
  table: string;
  label: string;
  migrationFile: string;
  status: "configured" | "missing";
  detail: string | null;
};

export const OPERATIONS_SCHEMA_TABLES = [
  { table: "vyron_cost_stores", label: "Stores master", migrationFile: "20260626_vyron_store_orders.sql" },
  { table: "vyron_cost_store_orders", label: "Store orders", migrationFile: "20260626_vyron_store_orders.sql" },
  { table: "vyron_cost_store_order_lines", label: "Store order lines", migrationFile: "20260626_vyron_store_orders.sql" },
  { table: "vyron_cost_store_order_events", label: "Store order events", migrationFile: "20260627_vyron_store_order_operations.sql" },
  { table: "vyron_store_order_approval_rules", label: "Store order approval rules", migrationFile: "20260628_vyron_store_order_commercial.sql" },
  { table: "vyron_cost_store_production_runs", label: "Store production runs", migrationFile: "20260629_vyron_store_production_planning.sql" },
  { table: "vyron_cost_inventory_transactions", label: "Inventory transactions", migrationFile: "20260630_vyron_inventory_transactions.sql" },
  { table: "vyron_cost_procurement_requisitions", label: "Procurement requisitions", migrationFile: "20260701_vyron_procurement_requisitions.sql" },
  { table: "vyron_cost_demand_forecasts", label: "Demand forecasts", migrationFile: "20260703_vyron_demand_forecasts.sql" },
  { table: "vyron_cost_ai_insights", label: "AI cost insights", migrationFile: "20260704_vyron_cost_ai_insights.sql" },
] as const;

export const OPERATIONS_CATCHUP_SQL = "supabase/vyron-cost-sprint-operations-catchup.sql";

export class SchemaReadinessError extends Error {
  status = 503;
  missingTables: string[];
  catchupSql: string;

  constructor(missingTables: string[], message: string) {
    super(message);
    this.name = "SchemaReadinessError";
    this.missingTables = missingTables;
    this.catchupSql = OPERATIONS_CATCHUP_SQL;
  }
}

function isMissingTableError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("could not find the table") ||
    (lower.includes("relation") && lower.includes("does not exist"))
  );
}

export async function checkOperationsSchemaTables(
  supabase?: SupabaseClient | null
): Promise<SchemaTableCheck[]> {
  const client = supabase || (isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null);
  const results: SchemaTableCheck[] = OPERATIONS_SCHEMA_TABLES.map((row) => ({
    table: row.table,
    label: row.label,
    migrationFile: row.migrationFile,
    status: "missing" as const,
    detail: null,
  }));

  if (!client) {
    for (const row of results) {
      row.detail = "Service role required to verify schema.";
    }
    return results;
  }

  for (const row of results) {
    const probe = await client.from(row.table).select("id").limit(1);
    if (probe.error) {
      if (isMissingTableError(probe.error.message)) {
        row.status = "missing";
        row.detail = `Table public.${row.table} not found. Apply ${row.migrationFile} or ${OPERATIONS_CATCHUP_SQL}.`;
        continue;
      }
      row.status = "configured";
      row.detail = probe.error.message;
      continue;
    }
    row.status = "configured";
    row.detail = `Table public.${row.table} is present.`;
  }

  return results;
}

export function formatMissingSchemaMessage(checks: SchemaTableCheck[]) {
  const missing = checks.filter((row) => row.status === "missing");
  if (!missing.length) return null;
  const tables = missing.map((row) => row.table).join(", ");
  return `Database schema incomplete (${tables}). Run ${OPERATIONS_CATCHUP_SQL} in Supabase SQL Editor, then reload the schema cache.`;
}

export async function assertOperationsSchemaReady(
  supabase: SupabaseClient,
  tables: string[] = ["vyron_cost_store_orders"]
) {
  const checks = await checkOperationsSchemaTables(supabase);
  const missing = checks.filter((row) => tables.includes(row.table) && row.status === "missing");
  if (!missing.length) return;
  const message =
    formatMissingSchemaMessage(missing) ||
    "Database schema incomplete. Apply sprint operations migrations.";
  throw new SchemaReadinessError(
    missing.map((row) => row.table),
    message
  );
}
