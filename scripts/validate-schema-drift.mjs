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

const checks = [
  {
    table: "vyron_customer_invoices",
    select: "id,company_id,customer_id,customer_name,invoice_number,status,sales_value,cost_value,gross_profit,gp_percentage,stock_posted,posted_at,stock_reversed,stock_reversed_at,notes,created_at,updated_at",
    migrationHint:
      "Apply src/supabase/migrations/20260605_manufacturing_customer_invoices_stock.sql + src/supabase/migrations/20260701_customer_invoices_schema_alignment.sql",
  },
  {
    table: "vyron_customer_invoice_lines",
    select: "id,invoice_id,product_id,product_name,quantity,selling_price,cost_per_unit,created_at",
    migrationHint:
      "Apply src/supabase/migrations/20260605_manufacturing_customer_invoices_stock.sql + src/supabase/migrations/20260701_customer_invoices_schema_alignment.sql",
  },
  {
    table: "vyron_cost_stock_counts",
    select: "id,count_number,count_type,status,notes,variance_value_total,created_by,approved_by,submitted_at,approved_at,posted_at,created_at,updated_at",
    migrationHint: "Apply supabase/inventory-batch-c-intelligence.sql",
  },
  {
    table: "vyron_cost_stock_count_lines",
    select: "id,stock_count_id,stock_item_id,system_qty,counted_qty,variance_qty,variance_pct,variance_value,variance_class,unit_cost,approved",
    migrationHint: "Apply supabase/inventory-batch-c-intelligence.sql",
  },
  {
    table: "vyron_cost_products",
    select: "id,product_name,selling_price,total_cost,target_gp,calculated_gp,actual_gp,linked_bom_id,updated_at",
    migrationHint:
      "Apply src/supabase/migrations/20260705_vyron_cost_products_actual_gp_alignment.sql + src/supabase/migrations/20260709_vyron_cost_products_updated_at_fix.sql",
  },
  {
    table: "vyron_cost_procurement_requisitions",
    select: "id,company_id,requisition_number,status,required_date,notes,created_by,created_at,updated_at",
    migrationHint:
      "Apply src/supabase/migrations/20260701_vyron_procurement_requisitions.sql or consolidated sync migration.",
  },
  {
    table: "vyron_cost_procurement_requisition_lines",
    select: "id,company_id,requisition_id,ingredient_id,ingredient_name,required_qty,available_qty,shortage_qty,unit,estimated_cost,preferred_supplier_id,sort_order,created_at",
    migrationHint:
      "Apply src/supabase/migrations/20260701_vyron_procurement_requisitions.sql or consolidated sync migration.",
  },
  {
    table: "vyron_cost_purchase_orders",
    select: "id,company_id,supplier_id,po_number,supplier_name_snapshot,status,order_date,expected_date,notes,subtotal,vat_amount,total,expected_total,invoice_total,variance,outstanding_amount,approved_by,approved_at,approval_notes,match_status,procurement_requisition_id,created_by,submitted_at,sent_at,closed_at,created_at,updated_at",
    migrationHint:
      "Apply consolidated procurement/purchase-order schema sync migration.",
  },
  {
    table: "vyron_cost_purchase_order_lines",
    select: "id,company_id,purchase_order_id,item_type,item_id,item_name,quantity,unit,unit_price,vat_rate,vat_amount,line_total,expected_delivery_date,ordered_qty,received_qty,damaged_qty,rejected_qty,outstanding_qty,sort_order,created_at,updated_at",
    migrationHint:
      "Apply consolidated procurement/purchase-order schema sync migration.",
  },
  {
    table: "vyron_cost_goods_receipts",
    select: "id,company_id,purchase_order_id,grn_number,supplier_id,supplier_name_snapshot,receipt_type,status,received_at,received_by,notes,created_at,updated_at",
    migrationHint:
      "Apply consolidated procurement/purchase-order schema sync migration.",
  },
  {
    table: "vyron_cost_goods_receipt_lines",
    select: "id,company_id,goods_receipt_id,purchase_order_line_id,item_name,ordered_qty,received_qty,damaged_qty,rejected_qty,outstanding_qty,unit,sort_order,created_at,updated_at",
    migrationHint:
      "Apply consolidated procurement/purchase-order schema sync migration.",
  },
  {
    table: "vyron_cost_back_orders",
    select: "id,company_id,purchase_order_id,purchase_order_line_id,supplier_id,supplier_name_snapshot,item_name,outstanding_qty,expected_date,status,created_at,updated_at",
    migrationHint:
      "Apply consolidated procurement/purchase-order schema sync migration.",
  },
  {
    table: "vyron_procurement_audit_log",
    select: "id,company_id,event_type,entity_type,entity_id,entity_label,detail,actor,metadata,created_at",
    migrationHint:
      "Apply consolidated procurement/purchase-order schema sync migration.",
  },
  {
    table: "vyron_po_approval_rules",
    select: "id,company_id,auto_approve_below,supervisor_approve_below,require_po_before_invoice_approval,created_at,updated_at",
    migrationHint:
      "Apply consolidated procurement/purchase-order schema sync migration.",
  },
  {
    table: "vyron_cost_stock_items",
    select: "id,company_id,entity_type,entity_id,item_code,description,unit,qty_on_hand,average_cost,current_cost,stock_status",
    migrationHint: "Apply supabase/inventory-batch-c-intelligence.sql",
  },
  {
    table: "vyron_workspaces",
    select: "id,company_id,package_name,status,user_limit",
    migrationHint: "Apply workspace bootstrap migrations",
  },
  {
    table: "vyron_workspace_memberships",
    select: "id,workspace_id,user_id,role,status,permissions",
    migrationHint: "Apply workspace bootstrap migrations",
  },
  {
    table: "vyron_finished_goods",
    select: "id,company_id,product_code,product_name,current_stock,selling_price",
    migrationHint: "Apply finished goods migrations",
  },
  {
    table: "vyron_cost_boms",
    select: "id,company_id,bom_name,status,yield_qty",
    migrationHint: "Apply src/supabase/migrations/20260615_bom_company_scope.sql",
  },
];

async function checkTable({ table, select, migrationHint }) {
  const { error } = await supabase.from(table).select(select).limit(1);
  if (!error) {
    return { table, ok: true, message: "ok" };
  }

  if (String(error.code || "") === "PGRST205") {
    return {
      table,
      ok: false,
      message: `missing table in schema cache: ${error.message}`,
      migrationHint,
    };
  }

  if (String(error.message || "").toLowerCase().includes("column")) {
    return {
      table,
      ok: false,
      message: `missing column(s): ${error.message}`,
      migrationHint,
    };
  }

  return { table, ok: false, message: error.message, migrationHint };
}

async function main() {
  const results = [];
  for (const check of checks) {
    results.push(await checkTable(check));
  }

  let failed = 0;
  for (const row of results) {
    if (row.ok) {
      console.log(`PASS - ${row.table}`);
      continue;
    }
    failed += 1;
    console.log(`FAIL - ${row.table} - ${row.message}`);
    if (row.migrationHint) console.log(`  Fix: ${row.migrationHint}`);
  }

  if (failed) {
    console.error(`\nSchema drift detected: ${failed} check(s) failed.`);
    process.exit(1);
  }

  console.log("\nPASS: schema validation checks completed with no drift.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
