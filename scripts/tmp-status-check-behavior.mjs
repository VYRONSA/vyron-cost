import fs from "fs";
import { createClient } from "@supabase/supabase-js";

for (const raw of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  process.env[line.slice(0, idx)] = line.slice(idx + 1).replace(/^\"|\"$/g, '');
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const statuses = ['Draft','Approved','Posted','Sent','Paid','Cancelled','Void','posted'];
let companyId = null;
let invoiceId = null;

try {
  const c = await sb.from('vyron_cost_companies').insert({ name: `CHK PROBE ${Date.now()}`, trading_name: 'CHK PROBE' }).select('id').single();
  if (c.error) throw c.error;
  companyId = c.data.id;

  const inv = await sb.from('vyron_customer_invoices').insert({
    company_id: companyId,
    customer_name: 'Constraint Probe Customer',
    invoice_number: `CHK-${Date.now()}`,
    status: 'Draft',
    sales_value: 1,
    cost_value: 1,
    gross_profit: 0,
    gp_percentage: 0,
    stock_posted: false,
    stock_reversed: false,
  }).select('id,status').single();
  if (inv.error) throw inv.error;
  invoiceId = inv.data.id;

  for (const s of statuses) {
    const r = await sb.from('vyron_customer_invoices').update({ status: s, updated_at: new Date().toISOString() }).eq('id', invoiceId).select('status').single();
    if (r.error) {
      console.log('STATUS_TEST', JSON.stringify({ status: s, ok: false, code: r.error.code, message: r.error.message, details: r.error.details }));
    } else {
      console.log('STATUS_TEST', JSON.stringify({ status: s, ok: true, stored: r.data?.status ?? null }));
    }
  }
} finally {
  try { if (invoiceId) await sb.from('vyron_customer_invoices').delete().eq('id', invoiceId); } catch {}
  try { if (companyId) await sb.from('vyron_cost_companies').delete().eq('id', companyId); } catch {}
}
