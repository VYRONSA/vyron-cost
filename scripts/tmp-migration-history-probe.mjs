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

const checks = [
  { schema: 'public', table: 'supabase_migrations_schema_migrations' },
  { schema: 'public', table: 'schema_migrations' },
  { schema: 'public', table: 'supabase_migrations' },
  { schema: 'public', table: 'migration_history' },
  { schema: 'public', table: 'vyron_schema_migrations' },
  { schema: 'public', table: 'vyron_migration_history' },
];

for (const t of checks) {
  const res = await sb.schema(t.schema).from(t.table).select('*').limit(1);
  console.log('MIGRATION_TABLE_PROBE', JSON.stringify({ table: `${t.schema}.${t.table}`, error: res.error ? { code: res.error.code, message: res.error.message, hint: res.error.hint } : null, hasRow: Array.isArray(res.data) && res.data.length > 0 }));
}
