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

const TABLES_FROM_MIGRATIONS = [
  "vyron_customer_sales_orders",
  "vyron_customer_sales_order_lines",
  "vyron_customer_sales_order_allocations",
  "vyron_customer_sales_order_invoice_links",
  "vyron_customer_sales_order_audit",
  "vyron_customer_sales_order_production_links",
  "vyron_customer_sales_order_requisition_links",
];

const EXTRA_REQUESTED_TABLES = ["vyron_customer_sales_order_items"];

const REQUIRED_CUSTOMER_COLUMNS = [
  "credit_limit",
  "on_hold",
  "invoice_email",
  "terms",
  "vat_number",
  "status",
  "active",
];

const REQUIRED_SALES_ORDER_COLUMNS = {
  vyron_customer_sales_orders: [
    "id",
    "company_id",
    "order_number",
    "customer_id",
    "customer_name",
    "status",
    "requires_approval",
    "approval_flags",
    "created_at",
    "updated_at",
  ],
  vyron_customer_sales_order_lines: [
    "id",
    "company_id",
    "sales_order_id",
    "product_id",
    "description",
    "quantity",
    "selling_price",
    "cost_per_unit",
    "invoiced_qty",
  ],
  vyron_customer_sales_order_allocations: [
    "id",
    "company_id",
    "sales_order_id",
    "sales_order_line_id",
    "product_id",
    "reserved_qty",
    "status",
  ],
  vyron_customer_sales_order_invoice_links: ["id", "company_id", "sales_order_id", "invoice_id", "created_at"],
  vyron_customer_sales_order_audit: [
    "id",
    "company_id",
    "sales_order_id",
    "event_type",
    "actor",
    "from_status",
    "to_status",
    "detail",
    "metadata",
    "created_at",
  ],
  vyron_customer_sales_order_production_links: ["id", "company_id", "sales_order_id", "production_run_id", "created_at"],
  vyron_customer_sales_order_requisition_links: ["id", "company_id", "sales_order_id", "requisition_id", "created_at"],
};

function existsMark(ok) {
  return ok ? "✅ Exists" : "❌ Missing";
}

async function probeTable(table) {
  const { error } = await supabase.from(table).select("*").limit(1);
  if (!error) return { ok: true, error: null };
  const message = String(error.message || "");
  if (message.toLowerCase().includes("could not find the table") || message.toLowerCase().includes("does not exist")) {
    return { ok: false, error: message };
  }
  return { ok: true, error: message };
}

async function probeColumn(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return { ok: true, error: null };
  const message = String(error.message || "");
  if (message.toLowerCase().includes("could not find the") && message.toLowerCase().includes("column")) {
    return { ok: false, error: message };
  }
  if (message.toLowerCase().includes("could not find the table") || message.toLowerCase().includes("does not exist")) {
    return { ok: false, error: message };
  }
  return { ok: true, error: message };
}

async function main() {
  const checkedAt = new Date().toISOString();
  const tableReport = [];
  const columnReport = [];

  for (const table of [...TABLES_FROM_MIGRATIONS, ...EXTRA_REQUESTED_TABLES]) {
    const result = await probeTable(table);
    let note = result.error || "";
    let status = existsMark(result.ok);
    if (table === "vyron_customer_sales_order_items" && !result.ok) {
      status = "⚠ Different definition";
      note = "Current migrations and app use vyron_customer_sales_order_lines instead of vyron_customer_sales_order_items.";
    }
    tableReport.push({ kind: "table", table, status, note });
  }

  for (const column of REQUIRED_CUSTOMER_COLUMNS) {
    const result = await probeColumn("vyron_customers", column);
    columnReport.push({
      kind: "column",
      table: "vyron_customers",
      column,
      status: existsMark(result.ok),
      note: result.error || "",
    });
  }

  for (const [table, columns] of Object.entries(REQUIRED_SALES_ORDER_COLUMNS)) {
    for (const column of columns) {
      const result = await probeColumn(table, column);
      columnReport.push({
        kind: "column",
        table,
        column,
        status: existsMark(result.ok),
        note: result.error || "",
      });
    }
  }

  const summary = {
    exists: [...tableReport, ...columnReport].filter((row) => row.status === "✅ Exists").length,
    missing: [...tableReport, ...columnReport].filter((row) => row.status === "❌ Missing").length,
    different: [...tableReport, ...columnReport].filter((row) => row.status === "⚠ Different definition").length,
  };

  console.log(
    JSON.stringify(
      {
        checkedAt,
        source: "Connected Supabase project from .env.local",
        capabilityNote:
          "PostgREST schema exposure does not allow direct information_schema access in this environment; verification is done by table/column probes.",
        tableReport,
        columnReport,
        summary,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
