const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^\"|\"$/g, '');
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const checks = [
  ['vyron_cost_inventory_transactions', 'id,company_id,transaction_number,transaction_type,entity_type,entity_id,stock_item_id,quantity,unit_cost,total_cost,reference_type,reference_id,notes,created_by,created_at'],
  ['vyron_stock_movements', 'id,company_id,movement_date,item_type,item_id,item_name,movement_type,reference_number,quantity_in,quantity_out,unit_cost,related_document_id,notes,created_at'],
  ['vyron_inventory', 'id'],
  ['vyron_inventory_locations', 'id'],
  ['vyron_inventory_batches', 'id'],
  ['vyron_inventory_adjustments', 'id'],
  ['vyron_stock_counts', 'id'],
  ['vyron_stock_count_lines', 'id'],
  ['vyron_cost_stock_counts', 'id,count_number,count_type,variance_value_total'],
  ['vyron_cost_stock_count_lines', 'id,stock_count_id,stock_item_id,system_qty,counted_qty,variance_qty,variance_value'],
  ['vyron_finished_goods', 'id,product_code,product_name,selling_price,current_stock,stock_value'],
];

(async () => {
  for (const [table, select] of checks) {
    const r = await sb.from(table).select(select).limit(1);
    if (r.error) console.log('FAIL', table, r.error.code || '', r.error.message || '');
    else console.log('PASS', table, 'rows', Array.isArray(r.data) ? r.data.length : 0);
  }
})();
