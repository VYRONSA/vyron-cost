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
const tables = [
  'vyron_cost_production_runs',
  'vyron_cost_production_run_lines',
  'vyron_cost_production_labour',
  'vyron_cost_production_overhead',
  'vyron_cost_production_wastage',
  'vyron_cost_production_audit_log',
  'vyron_cost_stock_items',
  'vyron_cost_stock_ledger',
  'vyron_inventory_audit_log',
  'vyron_cost_products',
  'vyron_cost_boms',
  'vyron_cost_bom_lines',
  'vyron_customer_invoices',
  'vyron_customer_invoice_lines',
  'vyron_finished_goods'
];
(async () => {
  for (const table of tables) {
    const r = await sb.from(table).select('id', { count: 'exact', head: true });
    if (r.error) console.log('MISSING_OR_ERROR', table, r.error.code || '', r.error.message || '');
    else console.log('OK', table, 'count', r.count);
  }
})();
