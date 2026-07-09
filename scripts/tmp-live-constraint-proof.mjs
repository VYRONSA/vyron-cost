import fs from "fs";
import { createClient } from "@supabase/supabase-js";

for (const raw of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  const k = line.slice(0, idx);
  const v = line.slice(idx + 1).replace(/^\"|\"$/g, '');
  process.env[k] = v;
}

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  .replace(/\/rest\/v1\/?$/i, '')
  .replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !key) {
  console.error('MISSING_ENV', JSON.stringify({ hasUrl: Boolean(supabaseUrl), hasKey: Boolean(key) }));
  process.exit(2);
}

const sb = createClient(supabaseUrl, key, { auth: { persistSession: false } });

async function tryQuery(name, fn) {
  try {
    const out = await fn();
    console.log(name, JSON.stringify(out));
  } catch (e) {
    console.log(name + '_THREW', JSON.stringify({ message: e?.message || String(e) }));
  }
}

await tryQuery('PUBLIC_CONSTRAINT_TABLE', async () => {
  const res = await sb
    .from('vyron_db_constraint_definitions')
    .select('*')
    .limit(3);
  return { error: res.error, count: res.data?.length ?? 0, sample: res.data?.[0] ?? null };
});

await tryQuery('INFO_SCHEMA_TABLE_CONSTRAINTS', async () => {
  const res = await sb
    .schema('information_schema')
    .from('table_constraints')
    .select('constraint_name,table_schema,table_name,constraint_type')
    .eq('table_schema', 'public')
    .eq('table_name', 'vyron_customer_invoices')
    .eq('constraint_name', 'vyron_customer_invoices_status_check');
  return { error: res.error, data: res.data };
});

await tryQuery('PG_CONSTRAINTS_VIEW', async () => {
  const res = await sb
    .schema('pg_catalog')
    .from('pg_constraint')
    .select('conname,contype,conbin,conrelid')
    .eq('conname', 'vyron_customer_invoices_status_check')
    .limit(5);
  return { error: res.error, data: res.data };
});

await tryQuery('RPC_RUN_SQL', async () => {
  const res = await sb.rpc('run_sql', { query: "select 1 as ok" });
  return { error: res.error, data: res.data };
});

await tryQuery('RPC_EXEC_SQL', async () => {
  const res = await sb.rpc('exec_sql', { sql: "select 1 as ok" });
  return { error: res.error, data: res.data };
});
