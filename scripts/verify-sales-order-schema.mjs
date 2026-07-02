import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  process.env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).replace(/^"|"$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const EXPECTED_TABLES = [
  "vyron_customer_sales_orders",
  "vyron_customer_sales_order_lines",
  "vyron_customer_sales_order_allocations",
  "vyron_customer_sales_order_invoice_links",
  "vyron_customer_sales_order_audit",
  "vyron_customer_sales_order_production_links",
  "vyron_customer_sales_order_requisition_links",
];

const REQUESTED_TABLES = [
  ...EXPECTED_TABLES,
  "vyron_customer_sales_order_items",
];

const EXPECTED_CUSTOMER_COLUMNS = {
  credit_limit: { data_type: "numeric", is_nullable: "NO" },
  on_hold: { data_type: "boolean", is_nullable: "NO" },
  invoice_email: { data_type: "text", is_nullable: "YES" },
  terms: { data_type: "text", is_nullable: "YES" },
  vat_number: { data_type: "text", is_nullable: "YES" },
  status: { data_type: "text", is_nullable: "YES" },
  active: { data_type: "boolean", is_nullable: "YES" },
};

const EXPECTED_SALES_ORDER_COLUMNS = {
  vyron_customer_sales_orders: {
    id: { data_type: "uuid", is_nullable: "NO" },
    company_id: { data_type: "uuid", is_nullable: "NO" },
    order_number: { data_type: "text", is_nullable: "NO" },
    customer_id: { data_type: "uuid", is_nullable: "YES" },
    customer_name: { data_type: "text", is_nullable: "NO" },
    delivery_address: { data_type: "text", is_nullable: "YES" },
    contact_name: { data_type: "text", is_nullable: "YES" },
    salesperson: { data_type: "text", is_nullable: "YES" },
    warehouse: { data_type: "text", is_nullable: "YES" },
    status: { data_type: "text", is_nullable: "NO" },
    requested_delivery_date: { data_type: "date", is_nullable: "YES" },
    notes: { data_type: "text", is_nullable: "YES" },
    subtotal: { data_type: "numeric", is_nullable: "NO" },
    vat_amount: { data_type: "numeric", is_nullable: "NO" },
    total: { data_type: "numeric", is_nullable: "NO" },
    cost_value: { data_type: "numeric", is_nullable: "NO" },
    gross_profit: { data_type: "numeric", is_nullable: "NO" },
    gp_percentage: { data_type: "numeric", is_nullable: "NO" },
    approved_at: { data_type: "timestamp with time zone", is_nullable: "YES" },
    approved_by: { data_type: "text", is_nullable: "YES" },
    picked_at: { data_type: "timestamp with time zone", is_nullable: "YES" },
    packed_at: { data_type: "timestamp with time zone", is_nullable: "YES" },
    dispatched_at: { data_type: "timestamp with time zone", is_nullable: "YES" },
    cancelled_at: { data_type: "timestamp with time zone", is_nullable: "YES" },
    requires_approval: { data_type: "boolean", is_nullable: "NO" },
    approval_flags: { data_type: "jsonb", is_nullable: "NO" },
    created_at: { data_type: "timestamp with time zone", is_nullable: "NO" },
    updated_at: { data_type: "timestamp with time zone", is_nullable: "NO" },
  },
  vyron_customer_sales_order_lines: {
    id: { data_type: "uuid", is_nullable: "NO" },
    company_id: { data_type: "uuid", is_nullable: "NO" },
    sales_order_id: { data_type: "uuid", is_nullable: "NO" },
    product_id: { data_type: "uuid", is_nullable: "YES" },
    description: { data_type: "text", is_nullable: "NO" },
    quantity: { data_type: "numeric", is_nullable: "NO" },
    unit: { data_type: "text", is_nullable: "NO" },
    selling_price: { data_type: "numeric", is_nullable: "NO" },
    discount_pct: { data_type: "numeric", is_nullable: "NO" },
    tax_rate: { data_type: "numeric", is_nullable: "NO" },
    line_total: { data_type: "numeric", is_nullable: "NO" },
    cost_per_unit: { data_type: "numeric", is_nullable: "NO" },
    invoiced_qty: { data_type: "numeric", is_nullable: "NO" },
    sort_order: { data_type: "integer", is_nullable: "NO" },
    created_at: { data_type: "timestamp with time zone", is_nullable: "NO" },
    updated_at: { data_type: "timestamp with time zone", is_nullable: "NO" },
  },
  vyron_customer_sales_order_allocations: {
    id: { data_type: "uuid", is_nullable: "NO" },
    company_id: { data_type: "uuid", is_nullable: "NO" },
    sales_order_id: { data_type: "uuid", is_nullable: "NO" },
    sales_order_line_id: { data_type: "uuid", is_nullable: "NO" },
    product_id: { data_type: "uuid", is_nullable: "YES" },
    reserved_qty: { data_type: "numeric", is_nullable: "NO" },
    available_qty_snapshot: { data_type: "numeric", is_nullable: "NO" },
    status: { data_type: "text", is_nullable: "NO" },
    created_at: { data_type: "timestamp with time zone", is_nullable: "NO" },
    updated_at: { data_type: "timestamp with time zone", is_nullable: "NO" },
  },
  vyron_customer_sales_order_invoice_links: {
    id: { data_type: "uuid", is_nullable: "NO" },
    company_id: { data_type: "uuid", is_nullable: "NO" },
    sales_order_id: { data_type: "uuid", is_nullable: "NO" },
    invoice_id: { data_type: "uuid", is_nullable: "NO" },
    created_at: { data_type: "timestamp with time zone", is_nullable: "NO" },
  },
  vyron_customer_sales_order_audit: {
    id: { data_type: "uuid", is_nullable: "NO" },
    company_id: { data_type: "uuid", is_nullable: "NO" },
    sales_order_id: { data_type: "uuid", is_nullable: "NO" },
    event_type: { data_type: "text", is_nullable: "NO" },
    actor: { data_type: "text", is_nullable: "YES" },
    from_status: { data_type: "text", is_nullable: "YES" },
    to_status: { data_type: "text", is_nullable: "YES" },
    detail: { data_type: "text", is_nullable: "YES" },
    metadata: { data_type: "jsonb", is_nullable: "NO" },
    created_at: { data_type: "timestamp with time zone", is_nullable: "NO" },
  },
  vyron_customer_sales_order_production_links: {
    id: { data_type: "uuid", is_nullable: "NO" },
    company_id: { data_type: "uuid", is_nullable: "NO" },
    sales_order_id: { data_type: "uuid", is_nullable: "NO" },
    production_run_id: { data_type: "uuid", is_nullable: "NO" },
    created_at: { data_type: "timestamp with time zone", is_nullable: "NO" },
  },
  vyron_customer_sales_order_requisition_links: {
    id: { data_type: "uuid", is_nullable: "NO" },
    company_id: { data_type: "uuid", is_nullable: "NO" },
    sales_order_id: { data_type: "uuid", is_nullable: "NO" },
    requisition_id: { data_type: "uuid", is_nullable: "NO" },
    created_at: { data_type: "timestamp with time zone", is_nullable: "NO" },
  },
};

const EXPECTED_FKS = [
  { table: "vyron_customer_sales_orders", column: "customer_id", ref_table: "vyron_customers", ref_column: "id" },
  { table: "vyron_customer_sales_order_lines", column: "sales_order_id", ref_table: "vyron_customer_sales_orders", ref_column: "id" },
  { table: "vyron_customer_sales_order_lines", column: "product_id", ref_table: "vyron_cost_products", ref_column: "id" },
  { table: "vyron_customer_sales_order_allocations", column: "sales_order_id", ref_table: "vyron_customer_sales_orders", ref_column: "id" },
  { table: "vyron_customer_sales_order_allocations", column: "sales_order_line_id", ref_table: "vyron_customer_sales_order_lines", ref_column: "id" },
  { table: "vyron_customer_sales_order_allocations", column: "product_id", ref_table: "vyron_cost_products", ref_column: "id" },
  { table: "vyron_customer_sales_order_invoice_links", column: "sales_order_id", ref_table: "vyron_customer_sales_orders", ref_column: "id" },
  { table: "vyron_customer_sales_order_invoice_links", column: "invoice_id", ref_table: "vyron_customer_invoices", ref_column: "id" },
  { table: "vyron_customer_sales_order_audit", column: "sales_order_id", ref_table: "vyron_customer_sales_orders", ref_column: "id" },
  { table: "vyron_customer_sales_order_production_links", column: "sales_order_id", ref_table: "vyron_customer_sales_orders", ref_column: "id" },
  { table: "vyron_customer_sales_order_production_links", column: "production_run_id", ref_table: "vyron_cost_production_runs", ref_column: "id" },
  { table: "vyron_customer_sales_order_requisition_links", column: "sales_order_id", ref_table: "vyron_customer_sales_orders", ref_column: "id" },
  { table: "vyron_customer_sales_order_requisition_links", column: "requisition_id", ref_table: "vyron_cost_procurement_requisitions", ref_column: "id" },
];

const EXPECTED_INDEXES = [
  "idx_vyron_customer_sales_orders_company_status",
  "idx_vyron_customer_sales_order_lines_order",
  "idx_vyron_customer_sales_order_allocations_order",
  "idx_vyron_customer_sales_order_invoice_links_order",
  "idx_vyron_customer_sales_order_audit_order",
  "idx_vyron_customer_sales_order_production_links_order",
  "idx_vyron_customer_sales_order_requisition_links_order",
];

function statusMark(kind) {
  if (kind === "exists") return "✅ Exists";
  if (kind === "missing") return "❌ Missing";
  return "⚠ Different definition";
}

function colKey(row) {
  return `${row.table_name}.${row.column_name}`;
}

async function fetchTables() {
  const { data, error } = await supabase
    .schema("information_schema")
    .from("tables")
    .select("table_name")
    .eq("table_schema", "public")
    .in("table_name", REQUESTED_TABLES);
  if (error) throw new Error(`tables query failed: ${error.message}`);
  return new Set((data || []).map((row) => row.table_name));
}

async function fetchColumns(tableNames) {
  const { data, error } = await supabase
    .schema("information_schema")
    .from("columns")
    .select("table_name,column_name,data_type,is_nullable,column_default")
    .eq("table_schema", "public")
    .in("table_name", tableNames);
  if (error) throw new Error(`columns query failed: ${error.message}`);
  return data || [];
}

async function fetchForeignKeys(tableNames) {
  const { data: tc, error: tcError } = await supabase
    .schema("information_schema")
    .from("table_constraints")
    .select("constraint_name,table_name")
    .eq("table_schema", "public")
    .eq("constraint_type", "FOREIGN KEY")
    .in("table_name", tableNames);
  if (tcError) throw new Error(`table_constraints query failed: ${tcError.message}`);

  const names = (tc || []).map((row) => row.constraint_name);
  if (!names.length) return [];

  const { data: kcu, error: kcuError } = await supabase
    .schema("information_schema")
    .from("key_column_usage")
    .select("constraint_name,table_name,column_name")
    .eq("table_schema", "public")
    .in("constraint_name", names);
  if (kcuError) throw new Error(`key_column_usage query failed: ${kcuError.message}`);

  const { data: ccu, error: ccuError } = await supabase
    .schema("information_schema")
    .from("constraint_column_usage")
    .select("constraint_name,table_name,column_name")
    .eq("table_schema", "public")
    .in("constraint_name", names);
  if (ccuError) throw new Error(`constraint_column_usage query failed: ${ccuError.message}`);

  const ccuByConstraint = new Map((ccu || []).map((row) => [row.constraint_name, row]));
  return (kcu || []).map((row) => {
    const ref = ccuByConstraint.get(row.constraint_name);
    return {
      table: row.table_name,
      column: row.column_name,
      ref_table: ref?.table_name || null,
      ref_column: ref?.column_name || null,
    };
  });
}

async function fetchIndexes(tableNames) {
  const { data, error } = await supabase
    .schema("pg_catalog")
    .from("pg_indexes")
    .select("indexname,tablename")
    .eq("schemaname", "public")
    .in("tablename", tableNames);
  if (error) throw new Error(`pg_indexes query failed: ${error.message}`);
  return data || [];
}

async function main() {
  const existingTables = await fetchTables();
  const columns = await fetchColumns(["vyron_customers", ...EXPECTED_TABLES]);
  const fks = await fetchForeignKeys(EXPECTED_TABLES);
  const indexes = await fetchIndexes(EXPECTED_TABLES);

  const colMap = new Map(columns.map((row) => [colKey(row), row]));
  const fkSet = new Set(fks.map((row) => `${row.table}.${row.column}->${row.ref_table}.${row.ref_column}`));
  const indexSet = new Set(indexes.map((row) => row.indexname));

  const report = {
    checkedAt: new Date().toISOString(),
    tables: [],
    customerColumns: [],
    salesOrderColumns: [],
    foreignKeys: [],
    indexes: [],
    summary: { exists: 0, missing: 0, different: 0 },
  };

  for (const table of REQUESTED_TABLES) {
    let kind = "exists";
    let note = "";
    if (!existingTables.has(table)) {
      kind = "missing";
      if (table === "vyron_customer_sales_order_items") {
        note = "Not created by current migrations; current app uses vyron_customer_sales_order_lines.";
      }
    }
    report.tables.push({ table, status: statusMark(kind), note });
    report.summary[kind === "exists" ? "exists" : kind === "missing" ? "missing" : "different"] += 1;
  }

  for (const [column, expected] of Object.entries(EXPECTED_CUSTOMER_COLUMNS)) {
    const found = colMap.get(`vyron_customers.${column}`);
    let kind = "exists";
    let detail = "";
    if (!found) {
      kind = "missing";
    } else {
      if (found.data_type !== expected.data_type || found.is_nullable !== expected.is_nullable) {
        kind = "different";
        detail = `expected ${expected.data_type}/${expected.is_nullable}, found ${found.data_type}/${found.is_nullable}`;
      }
    }
    report.customerColumns.push({ table: "vyron_customers", column, status: statusMark(kind), detail });
    report.summary[kind === "exists" ? "exists" : kind === "missing" ? "missing" : "different"] += 1;
  }

  for (const [table, tableColumns] of Object.entries(EXPECTED_SALES_ORDER_COLUMNS)) {
    for (const [column, expected] of Object.entries(tableColumns)) {
      const found = colMap.get(`${table}.${column}`);
      let kind = "exists";
      let detail = "";
      if (!found) {
        kind = "missing";
      } else if (found.data_type !== expected.data_type || found.is_nullable !== expected.is_nullable) {
        kind = "different";
        detail = `expected ${expected.data_type}/${expected.is_nullable}, found ${found.data_type}/${found.is_nullable}`;
      }
      report.salesOrderColumns.push({ table, column, status: statusMark(kind), detail });
      report.summary[kind === "exists" ? "exists" : kind === "missing" ? "missing" : "different"] += 1;
    }
  }

  for (const fk of EXPECTED_FKS) {
    const key = `${fk.table}.${fk.column}->${fk.ref_table}.${fk.ref_column}`;
    const exists = fkSet.has(key);
    report.foreignKeys.push({ ...fk, status: statusMark(exists ? "exists" : "missing") });
    report.summary[exists ? "exists" : "missing"] += 1;
  }

  for (const name of EXPECTED_INDEXES) {
    const exists = indexSet.has(name);
    report.indexes.push({ index: name, status: statusMark(exists ? "exists" : "missing") });
    report.summary[exists ? "exists" : "missing"] += 1;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
