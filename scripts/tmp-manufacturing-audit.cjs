const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^\"|\"$/g, '');
}
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const checks = [
  ['vyron_cost_production_runs', 'id,company_id,run_number,bom_id,recipe_id,product_id,bom_name_snapshot,product_name_snapshot,status,batch_multiplier,planned_qty,actual_qty,yield_pct,yield_status,wastage_pct,ingredient_cost,packaging_cost,labour_cost,overhead_cost,ingredient_waste_value,packaging_waste_value,total_production_cost,cost_per_unit,planned_cost,actual_cost,cost_variance_pct,planned_usage_value,actual_usage_value,usage_variance_pct,production_efficiency_pct,stock_override,stock_override_by,stock_override_reason,notes,created_by,approved_by,started_by,completed_by,approved_at,started_at,completed_at,cancelled_at,created_at,updated_at'],
  ['vyron_cost_production_run_lines', 'id,company_id,production_run_id,line_type,ingredient_id,stock_item_id,line_name,unit,planned_qty,actual_qty,unit_cost,planned_value,actual_value,sort_order'],
  ['vyron_cost_production_labour', 'id,company_id,production_run_id,description,hours,rate,labour_cost'],
  ['vyron_cost_production_overhead', 'id,company_id,production_run_id,overhead_type,allocation_method,amount,percent_value,allocated_cost'],
  ['vyron_cost_production_wastage', 'id,company_id,production_run_id,waste_category,line_name,ingredient_id,waste_qty,waste_value,waste_reason'],
  ['vyron_cost_production_audit_log', 'id,company_id,production_run_id,event_type,actor,field_name,old_value,new_value,detail,created_at'],
  ['vyron_stock_movements', 'id,company_id,movement_date,item_type,item_id,item_name,movement_type,reference_number,quantity_in,quantity_out,unit_cost,total_value,related_document_id,notes,created_at'],
  ['vyron_finished_goods', 'id,company_id,product_code,product_name,category,current_stock,stock_value,standard_cost,latest_actual_cost,selling_price,active,created_at,updated_at']
];

(async () => {
  for (const [table, select] of checks) {
    const r = await sb.from(table).select(select).limit(1);
    if (r.error) {
      console.log('FAIL', table, r.error.code || '', r.error.message || '');
    } else {
      console.log('PASS', table);
    }
  }
})();
