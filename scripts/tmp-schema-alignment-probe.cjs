const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) { const t=line.trim(); if(!t||t.startsWith('#')) continue; const i=t.indexOf('='); if(i===-1) continue; process.env[t.slice(0,i)] = t.slice(i+1).replace(/^\"|\"$/g,''); }
const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/rest\/v1\/?$/i,'').replace(/\/$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb=createClient(url,key,{auth:{persistSession:false}});
(async()=>{
  const checks=[['vyron_cost_stock_counts',['id','count_number','count_type','status','notes','variance_value_total','created_by','approved_by','submitted_at','approved_at','posted_at','created_at','updated_at']],['vyron_cost_stock_count_lines',['id','stock_count_id','stock_item_id','system_qty','counted_qty','variance_qty','variance_pct','variance_value','variance_class','unit_cost','approved','created_at']],['vyron_finished_goods',['id','company_id','product_code','product_name','category','current_stock','stock_value','standard_cost','latest_actual_cost','selling_price','active','created_at','updated_at']]];
  for (const [table, cols] of checks){
    const select = cols.join(',');
    const r = await sb.from(table).select(select).limit(1);
    if (r.error) console.log('FAIL', table, r.error.code||'', r.error.message||'');
    else console.log('PASS', table, 'rows', Array.isArray(r.data)?r.data.length:0);
  }
})();
