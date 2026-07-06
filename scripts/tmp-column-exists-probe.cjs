const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) { const t=line.trim(); if(!t||t.startsWith('#')) continue; const i=t.indexOf('='); if(i===-1) continue; process.env[t.slice(0,i)] = t.slice(i+1).replace(/^\"|\"$/g,''); }
const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/rest\/v1\/?$/i,'').replace(/\/$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb=createClient(url,key,{auth:{persistSession:false}});
async function hasCol(table,col){ const r = await sb.from(table).select(col).limit(1); return !r.error; }
(async()=>{
  const checks = {
    vyron_cost_stock_counts: ['id','company_id','count_number','count_type','status','notes','variance_value_total','created_by','approved_by','submitted_at','approved_at','posted_at','created_at','updated_at','count_scope','count_category','warehouse_id','location_id'],
    vyron_cost_stock_count_lines: ['id','company_id','stock_count_id','stock_item_id','system_qty','counted_qty','variance_qty','variance_pct','variance_value','variance_class','unit_cost','approved','created_at','updated_at','item_id','ingredient_id','product_id','entity_id','inventory_item_id','stock_id']
  };
  for (const [table, cols] of Object.entries(checks)){
    console.log('\nTABLE',table);
    for (const c of cols){
      const ok = await hasCol(table,c);
      if (ok) console.log('EXISTS',c);
    }
  }
})();
