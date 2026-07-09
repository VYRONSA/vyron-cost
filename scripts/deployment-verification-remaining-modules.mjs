import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing Supabase env.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const requirements = {
  modules: {
    "Branches / Warehouses": {
      tables: [
        {
          name: "vyron_cost_stores",
          columns: ["id", "company_id", "store_code", "store_name", "status", "created_at", "updated_at"],
          migration: "src/supabase/migrations/20260626_vyron_store_orders.sql",
          catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql",
        },
        {
          name: "vyron_cost_store_orders",
          columns: ["id", "company_id", "store_id", "order_number", "status", "order_date", "created_at", "updated_at"],
          migration: "src/supabase/migrations/20260626_vyron_store_orders.sql",
          catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql",
        },
        {
          name: "vyron_cost_store_order_lines",
          columns: ["id", "company_id", "store_order_id", "product_id", "quantity", "unit_price", "line_total"],
          migration: "src/supabase/migrations/20260626_vyron_store_orders.sql",
          catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql",
        },
        {
          name: "vyron_cost_store_order_events",
          columns: ["id", "company_id", "store_order_id", "action", "from_status", "to_status", "created_at"],
          migration: "src/supabase/migrations/20260627_vyron_store_order_operations.sql",
          catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql",
        },
        {
          name: "vyron_store_order_approval_rules",
          columns: ["id", "company_id", "max_order_value", "min_margin_pct", "max_qty_variance_pct", "warn_inactive_products"],
          migration: "src/supabase/migrations/20260628_vyron_store_order_commercial.sql",
          catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql",
        },
      ],
      foreignKeys: [
        {
          name: "vyron_cost_store_orders.store_id -> vyron_cost_stores.id",
          migration: "src/supabase/migrations/20260626_vyron_store_orders.sql",
          catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql",
          dependsOnTables: ["vyron_cost_store_orders", "vyron_cost_stores"],
        },
      ],
      indexes: [
        {
          name: "vyron_cost_stores_company_code_uidx",
          migration: "src/supabase/migrations/20260626_vyron_store_orders.sql",
          catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql",
          dependsOnTables: ["vyron_cost_stores"],
        },
        {
          name: "vyron_cost_store_orders_company_number_uidx",
          migration: "src/supabase/migrations/20260626_vyron_store_orders.sql",
          catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql",
          dependsOnTables: ["vyron_cost_store_orders"],
        },
      ],
      views: [],
      functions: [],
      rpcs: [],
    },
    Dashboard: {
      tables: [
        {
          name: "vyron_cost_stock_items",
          columns: ["id", "company_id", "entity_type", "qty_on_hand", "inventory_value", "stock_status"],
          migration: "supabase/inventory-batch-c-intelligence.sql",
          catchupSql: "supabase/inventory-batch-c-intelligence.sql",
        },
        {
          name: "vyron_cost_purchase_orders",
          columns: ["id", "company_id", "status", "total", "created_at"],
          migration: "supabase/procurement-batch-b-po-grn-match.sql",
          catchupSql: "supabase/procurement-batch-b-po-grn-match.sql",
        },
        {
          name: "vyron_cost_production_runs",
          columns: ["id", "company_id", "status", "planned_qty", "actual_qty", "created_at"],
          migration: "supabase/manufacturing-batch-d-production.sql",
          catchupSql: "supabase/manufacturing-batch-d-production.sql",
        },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    Products: {
      tables: [
        {
          name: "vyron_cost_products",
          columns: ["id", "company_id", "product_name", "product_category", "selling_price", "total_cost", "target_gp", "actual_gp", "linked_bom_id", "updated_at"],
          migration: "src/supabase/migrations/20260705_vyron_cost_products_actual_gp_alignment.sql",
          catchupSql: "supabase/schema-repair-june-2026.sql",
        },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    Categories: {
      tables: [
        {
          name: "vyron_cost_ingredients",
          columns: ["id", "company_id", "ingredient_name", "category", "purchase_cost", "updated_at"],
          migration: "supabase/days7-10-vyron-cost-core-saas.sql",
          catchupSql: "supabase/vyron-cost-demo-schema-catchup.sql",
        },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    Suppliers: {
      tables: [
        {
          name: "vyron_cost_suppliers",
          columns: ["id", "company_id", "supplier_name", "contact_email", "risk_status", "updated_at"],
          migration: "supabase/days7-10-vyron-cost-core-saas.sql",
          catchupSql: "supabase/vyron-cost-demo-schema-catchup.sql",
        },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    "Purchase Orders": {
      tables: [
        {
          name: "vyron_cost_purchase_orders",
          columns: ["id", "company_id", "po_number", "supplier_id", "status", "order_date", "total", "procurement_requisition_id", "updated_at"],
          migration: "supabase/procurement-batch-b-po-grn-match.sql",
          catchupSql: "supabase/procurement-batch-b-po-grn-match.sql",
        },
        {
          name: "vyron_cost_purchase_order_lines",
          columns: ["id", "company_id", "purchase_order_id", "item_name", "quantity", "received_qty", "outstanding_qty"],
          migration: "supabase/procurement-batch-b-po-grn-match.sql",
          catchupSql: "supabase/procurement-batch-b-po-grn-match.sql",
        },
        {
          name: "vyron_po_approval_rules",
          columns: ["id", "company_id", "auto_approve_below", "supervisor_approve_below", "require_po_before_invoice_approval"],
          migration: "supabase/procurement-batch-b-po-grn-match.sql",
          catchupSql: "supabase/procurement-batch-b-po-grn-match.sql",
        },
      ],
      foreignKeys: [
        {
          name: "vyron_cost_purchase_order_lines.purchase_order_id -> vyron_cost_purchase_orders.id",
          migration: "supabase/procurement-batch-b-po-grn-match.sql",
          catchupSql: "supabase/procurement-batch-b-po-grn-match.sql",
          dependsOnTables: ["vyron_cost_purchase_order_lines", "vyron_cost_purchase_orders"],
        },
      ],
      indexes: [
        {
          name: "idx_vyron_po_lines_po",
          migration: "supabase/procurement-batch-b-po-grn-match.sql",
          catchupSql: "supabase/procurement-batch-b-po-grn-match.sql",
          dependsOnTables: ["vyron_cost_purchase_order_lines"],
        },
      ],
      views: [],
      functions: [],
      rpcs: [],
    },
    "Goods Receiving": {
      tables: [
        {
          name: "vyron_cost_goods_receipts",
          columns: ["id", "company_id", "purchase_order_id", "grn_number", "status", "received_at"],
          migration: "supabase/procurement-batch-b-po-grn-match.sql",
          catchupSql: "supabase/procurement-batch-b-po-grn-match.sql",
        },
        {
          name: "vyron_cost_goods_receipt_lines",
          columns: ["id", "company_id", "goods_receipt_id", "purchase_order_line_id", "received_qty", "outstanding_qty"],
          migration: "supabase/procurement-batch-b-po-grn-match.sql",
          catchupSql: "supabase/procurement-batch-b-po-grn-match.sql",
        },
        {
          name: "vyron_cost_back_orders",
          columns: ["id", "company_id", "purchase_order_id", "purchase_order_line_id", "outstanding_qty", "status"],
          migration: "supabase/procurement-batch-b-po-grn-match.sql",
          catchupSql: "supabase/procurement-batch-b-po-grn-match.sql",
        },
      ],
      foreignKeys: [],
      indexes: [{ name: "idx_vyron_grn_po", migration: "supabase/procurement-batch-b-po-grn-match.sql", catchupSql: "supabase/procurement-batch-b-po-grn-match.sql", dependsOnTables: ["vyron_cost_goods_receipts"] }],
      views: [],
      functions: [],
      rpcs: [],
    },
    Manufacturing: {
      tables: [
        {
          name: "vyron_cost_production_runs",
          columns: ["id", "company_id", "run_number", "bom_id", "product_id", "status", "planned_qty", "actual_qty", "created_at"],
          migration: "supabase/manufacturing-batch-d-production.sql",
          catchupSql: "supabase/manufacturing-batch-d-production.sql",
        },
        {
          name: "vyron_cost_production_run_lines",
          columns: ["id", "company_id", "production_run_id", "line_type", "planned_qty", "actual_qty", "unit_cost"],
          migration: "supabase/manufacturing-batch-d-production.sql",
          catchupSql: "supabase/manufacturing-batch-d-production.sql",
        },
        {
          name: "vyron_cost_production_labour",
          columns: ["id", "company_id", "production_run_id", "hours", "rate", "labour_cost"],
          migration: "supabase/manufacturing-batch-d-production.sql",
          catchupSql: "supabase/manufacturing-batch-d-production.sql",
        },
        {
          name: "vyron_cost_production_overhead",
          columns: ["id", "company_id", "production_run_id", "overhead_type", "amount", "allocated_cost"],
          migration: "supabase/manufacturing-batch-d-production.sql",
          catchupSql: "supabase/manufacturing-batch-d-production.sql",
        },
        {
          name: "vyron_cost_production_wastage",
          columns: ["id", "company_id", "production_run_id", "waste_category", "waste_qty", "waste_value"],
          migration: "supabase/manufacturing-batch-d-production.sql",
          catchupSql: "supabase/manufacturing-batch-d-production.sql",
        },
      ],
      foreignKeys: [],
      indexes: [{ name: "idx_vyron_prod_runs_company", migration: "supabase/manufacturing-batch-d-production.sql", catchupSql: "supabase/manufacturing-batch-d-production.sql", dependsOnTables: ["vyron_cost_production_runs"] }],
      views: [],
      functions: [],
      rpcs: [],
    },
    "Bills of Materials": {
      tables: [
        {
          name: "vyron_cost_boms",
          columns: ["id", "company_id", "bom_name", "yield_qty", "cost_per_unit", "status", "product_id"],
          migration: "supabase/manufacturing-batch-d-production.sql",
          catchupSql: "supabase/manufacturing-batch-d-production.sql",
        },
        {
          name: "vyron_cost_bom_lines",
          columns: ["id", "company_id", "bom_id", "line_type", "ingredient_id", "quantity", "unit_cost", "line_cost"],
          migration: "supabase/manufacturing-batch-d-production.sql",
          catchupSql: "supabase/manufacturing-batch-d-production.sql",
        },
      ],
      foreignKeys: [],
      indexes: [{ name: "idx_vyron_bom_lines_bom", migration: "supabase/manufacturing-batch-d-production.sql", catchupSql: "supabase/manufacturing-batch-d-production.sql", dependsOnTables: ["vyron_cost_bom_lines"] }],
      views: [],
      functions: [],
      rpcs: [],
    },
    "Sales Orders": {
      tables: [
        {
          name: "vyron_customer_sales_orders",
          columns: ["id", "company_id", "order_number", "customer_id", "status", "created_at"],
          migration: "src/supabase/migrations/20260706_customer_sales_orders.sql",
          catchupSql: "src/supabase/migrations/20260708_customer_sales_orders_schema_sync.sql",
        },
        {
          name: "vyron_customer_sales_order_lines",
          columns: ["id", "sales_order_id", "product_id", "quantity", "selling_price", "line_total"],
          migration: "src/supabase/migrations/20260706_customer_sales_orders.sql",
          catchupSql: "src/supabase/migrations/20260708_customer_sales_orders_schema_sync.sql",
        },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    Reporting: {
      tables: [
        { name: "vyron_cost_stock_items", columns: ["id", "company_id", "qty_on_hand", "inventory_value"], migration: "supabase/inventory-batch-c-intelligence.sql", catchupSql: "supabase/inventory-batch-c-intelligence.sql" },
        { name: "vyron_cost_production_runs", columns: ["id", "company_id", "status", "actual_qty", "total_production_cost"], migration: "supabase/manufacturing-batch-d-production.sql", catchupSql: "supabase/manufacturing-batch-d-production.sql" },
        { name: "vyron_customer_invoices", columns: ["id", "company_id", "sales_value", "cost_value", "gross_profit", "gp_percentage", "invoice_date"], migration: "src/supabase/migrations/20260701_customer_invoices_schema_alignment.sql", catchupSql: "src/supabase/migrations/20260701_customer_invoices_schema_alignment.sql" },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    Notifications: {
      tables: [
        { name: "vyron_cost_low_stock_alerts", columns: ["id", "company_id", "stock_item_id", "status", "created_at"], migration: "supabase/inventory-batch-c-intelligence.sql", catchupSql: "supabase/inventory-batch-c-intelligence.sql" },
        { name: "vyron_procurement_audit_log", columns: ["id", "company_id", "event_type", "created_at"], migration: "supabase/procurement-batch-b-po-grn-match.sql", catchupSql: "supabase/procurement-batch-b-po-grn-match.sql" },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    "Advanced Search": {
      tables: [
        { name: "vyron_cost_products", columns: ["id", "company_id", "product_name"], migration: "supabase/days7-10-vyron-cost-core-saas.sql", catchupSql: "supabase/vyron-cost-demo-schema-catchup.sql" },
        { name: "vyron_cost_ingredients", columns: ["id", "company_id", "ingredient_name"], migration: "supabase/days7-10-vyron-cost-core-saas.sql", catchupSql: "supabase/vyron-cost-demo-schema-catchup.sql" },
        { name: "vyron_cost_suppliers", columns: ["id", "company_id", "supplier_name"], migration: "supabase/days7-10-vyron-cost-core-saas.sql", catchupSql: "supabase/vyron-cost-demo-schema-catchup.sql" },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    "Excel Export": {
      tables: [
        { name: "vyron_cost_purchase_orders", columns: ["id", "company_id", "po_number", "total"], migration: "supabase/procurement-batch-b-po-grn-match.sql", catchupSql: "supabase/procurement-batch-b-po-grn-match.sql" },
        { name: "vyron_customer_invoices", columns: ["id", "company_id", "invoice_number", "sales_value"], migration: "src/supabase/migrations/20260701_customer_invoices_schema_alignment.sql", catchupSql: "src/supabase/migrations/20260701_customer_invoices_schema_alignment.sql" },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    Printing: {
      tables: [
        { name: "vyron_cost_purchase_orders", columns: ["id", "company_id", "po_number", "supplier_name_snapshot"], migration: "supabase/procurement-batch-b-po-grn-match.sql", catchupSql: "supabase/procurement-batch-b-po-grn-match.sql" },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    Email: {
      tables: [
        { name: "vyron_cost_purchase_orders", columns: ["id", "company_id", "po_number", "supplier_id"], migration: "supabase/procurement-batch-b-po-grn-match.sql", catchupSql: "supabase/procurement-batch-b-po-grn-match.sql" },
        { name: "vyron_procurement_audit_log", columns: ["id", "company_id", "event_type", "detail"], migration: "supabase/procurement-batch-b-po-grn-match.sql", catchupSql: "supabase/procurement-batch-b-po-grn-match.sql" },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    "AI Dashboards": {
      tables: [
        { name: "vyron_cost_ai_insights", columns: ["id", "company_id", "insight_key", "insight_type", "priority", "status", "created_at"], migration: "src/supabase/migrations/20260704_vyron_cost_ai_insights.sql", catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql" },
      ],
      foreignKeys: [],
      indexes: [{ name: "vyron_cost_ai_insights_company_key_uidx", migration: "src/supabase/migrations/20260704_vyron_cost_ai_insights.sql", catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql", dependsOnTables: ["vyron_cost_ai_insights"] }],
      views: [],
      functions: [],
      rpcs: [],
    },
    "Business Health": {
      tables: [
        { name: "vyron_cost_ai_insights", columns: ["id", "company_id", "insight_type", "priority", "status"], migration: "src/supabase/migrations/20260704_vyron_cost_ai_insights.sql", catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql" },
        { name: "vyron_customer_invoices", columns: ["id", "company_id", "sales_value", "gross_profit"], migration: "src/supabase/migrations/20260701_customer_invoices_schema_alignment.sql", catchupSql: "src/supabase/migrations/20260701_customer_invoices_schema_alignment.sql" },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    "Root Cause": {
      tables: [
        { name: "vyron_cost_ai_insights", columns: ["id", "company_id", "problem", "impact", "recommendation"], migration: "src/supabase/migrations/20260704_vyron_cost_ai_insights.sql", catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql" },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    "Early Warning": {
      tables: [
        { name: "vyron_cost_low_stock_alerts", columns: ["id", "company_id", "stock_item_id", "status"], migration: "supabase/inventory-batch-c-intelligence.sql", catchupSql: "supabase/inventory-batch-c-intelligence.sql" },
        { name: "vyron_cost_ai_insights", columns: ["id", "company_id", "priority", "status"], migration: "src/supabase/migrations/20260704_vyron_cost_ai_insights.sql", catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql" },
      ],
      foreignKeys: [],
      indexes: [],
      views: [],
      functions: [],
      rpcs: [],
    },
    "Demand Forecasting": {
      tables: [
        { name: "vyron_cost_demand_forecasts", columns: ["id", "company_id", "forecast_date", "product_id", "period_type", "forecast_qty", "confidence_level"], migration: "src/supabase/migrations/20260703_vyron_demand_forecasts.sql", catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql" },
      ],
      foreignKeys: [],
      indexes: [{ name: "vyron_cost_demand_forecasts_company_date_idx", migration: "src/supabase/migrations/20260703_vyron_demand_forecasts.sql", catchupSql: "supabase/vyron-cost-sprint-operations-catchup.sql", dependsOnTables: ["vyron_cost_demand_forecasts"] }],
      views: [],
      functions: [],
      rpcs: [],
    },
  },
};

async function tableExists(table) {
  const { error } = await supabase.from(table).select("id", { count: "exact", head: true }).limit(1);
  if (!error) return { exists: true };
  const message = String(error.message || "");
  if (String(error.code || "") === "PGRST205" || message.toLowerCase().includes("could not find the table") || message.toLowerCase().includes("does not exist")) {
    return { exists: false, error: message };
  }
  return { exists: true, warning: message };
}

async function columnExists(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return { exists: true };
  const message = String(error.message || "");
  if (message.toLowerCase().includes("column") && message.toLowerCase().includes("does not exist")) {
    return { exists: false, error: message };
  }
  if (String(error.code || "") === "PGRST205" || message.toLowerCase().includes("could not find the table")) {
    return { exists: false, error: message };
  }
  return { exists: true, warning: message };
}

function isMissingTableMessage(message) {
  const lower = String(message || "").toLowerCase();
  return lower.includes("could not find the table") || (lower.includes("relation") && lower.includes("does not exist"));
}

async function verify() {
  const missing = [];
  const warnings = [];
  const missingTables = new Set();
  const reportedMissingTables = new Set();
  const moduleSummaries = [];

  for (const [moduleName, moduleReq] of Object.entries(requirements.modules)) {
    let moduleMissingCount = 0;

    for (const tableReq of moduleReq.tables) {
      const probe = await tableExists(tableReq.name);
      if (!probe.exists) {
        moduleMissingCount += 1;
        missingTables.add(tableReq.name);
        missing.push({
          module: moduleName,
          objectType: "table",
          objectName: tableReq.name,
          repositorySource: tableReq.migration,
          catchupSql: tableReq.catchupSql || null,
          reason: probe.error || "table missing",
        });
        continue;
      }
      if (probe.warning) {
        warnings.push({ module: moduleName, objectType: "table", objectName: tableReq.name, warning: probe.warning });
      }

      for (const column of tableReq.columns || []) {
        const colProbe = await columnExists(tableReq.name, column);
        if (!colProbe.exists) {
          const moduleTableKey = `${moduleName}:${tableReq.name}`;
          if (isMissingTableMessage(colProbe.error) && !reportedMissingTables.has(moduleTableKey)) {
            moduleMissingCount += 1;
            missingTables.add(tableReq.name);
            reportedMissingTables.add(moduleTableKey);
            missing.push({
              module: moduleName,
              objectType: "table",
              objectName: tableReq.name,
              repositorySource: tableReq.migration,
              catchupSql: tableReq.catchupSql || null,
              reason: colProbe.error || "table missing",
            });
            break;
          }
          moduleMissingCount += 1;
          missing.push({
            module: moduleName,
            objectType: "column",
            objectName: `${tableReq.name}.${column}`,
            repositorySource: tableReq.migration,
            catchupSql: tableReq.catchupSql || null,
            reason: colProbe.error || "column missing",
          });
        } else if (colProbe.warning) {
          warnings.push({ module: moduleName, objectType: "column", objectName: `${tableReq.name}.${column}`, warning: colProbe.warning });
        }
      }
    }

    for (const fk of moduleReq.foreignKeys || []) {
      const dependentMissing = (fk.dependsOnTables || []).some((t) => missingTables.has(t));
      if (dependentMissing) {
        moduleMissingCount += 1;
        missing.push({
          module: moduleName,
          objectType: "foreign_key",
          objectName: fk.name,
          repositorySource: fk.migration,
          catchupSql: fk.catchupSql || null,
          reason: "dependent table missing",
        });
      } else {
        warnings.push({
          module: moduleName,
          objectType: "foreign_key",
          objectName: fk.name,
          warning: "not directly introspectable via PostgREST metadata; requires SQL metadata access",
        });
      }
    }

    for (const idx of moduleReq.indexes || []) {
      const dependentMissing = (idx.dependsOnTables || []).some((t) => missingTables.has(t));
      if (dependentMissing) {
        moduleMissingCount += 1;
        missing.push({
          module: moduleName,
          objectType: "index",
          objectName: idx.name,
          repositorySource: idx.migration,
          catchupSql: idx.catchupSql || null,
          reason: "dependent table missing",
        });
      } else {
        warnings.push({
          module: moduleName,
          objectType: "index",
          objectName: idx.name,
          warning: "not directly introspectable via PostgREST metadata; requires SQL metadata access",
        });
      }
    }

    for (const view of moduleReq.views || []) {
      const probe = await tableExists(view.name);
      if (!probe.exists) {
        moduleMissingCount += 1;
        missing.push({
          module: moduleName,
          objectType: "view",
          objectName: view.name,
          repositorySource: view.migration,
          catchupSql: view.catchupSql || null,
          reason: probe.error || "view missing",
        });
      }
    }

    for (const fn of moduleReq.functions || []) {
      warnings.push({
        module: moduleName,
        objectType: "function",
        objectName: fn.name,
        warning: "function existence not directly introspectable here without SQL metadata access",
      });
    }

    for (const rpc of moduleReq.rpcs || []) {
      warnings.push({
        module: moduleName,
        objectType: "rpc",
        objectName: rpc.name,
        warning: "no module-scoped RPC calls detected in app runtime code",
      });
    }

    moduleSummaries.push({ module: moduleName, missingCount: moduleMissingCount });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scope: Object.keys(requirements.modules),
    connectedDb: url,
    missingCount: missing.length,
    missing,
    moduleSummaries,
    verificationLimitations: [
      "Direct catalog introspection for indexes/foreign keys/functions/views via information_schema/pg_catalog is blocked in current PostgREST exposure.",
      "Index/FK presence is reported as missing only when dependent tables are missing; otherwise flagged as requiring SQL metadata verification.",
    ],
    warnings,
  };

  writeFileSync("deployment-gap-report.json", JSON.stringify(report, null, 2));

  console.log(`Deployment verification complete. Missing objects: ${missing.length}`);
  for (const row of moduleSummaries) {
    console.log(`${row.module}: missing=${row.missingCount}`);
  }
  if (missing.length) {
    console.log("\nMissing objects:");
    for (const row of missing) {
      console.log(`- [${row.module}] ${row.objectType} ${row.objectName}`);
      console.log(`  source: ${row.repositorySource}`);
      if (row.catchupSql) console.log(`  catchup: ${row.catchupSql}`);
      console.log(`  reason: ${row.reason}`);
    }
  }
}

verify().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
