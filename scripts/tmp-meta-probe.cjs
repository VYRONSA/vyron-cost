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
(async () => {
  const checks = [
    { table: 'information_schema.columns', name: 'columns-meta' },
    { table: 'pg_catalog.pg_indexes', name: 'indexes-meta' },
    { table: 'pg_catalog.pg_constraint', name: 'constraints-meta' },
    { table: 'supabase_migrations.schema_migrations', name: 'migration-history' }
  ];
  for (const c of checks) {
    const r = await sb.from(c.table).select('*').limit(1);
    if (r.error) console.log('META_FAIL', c.name, c.table, r.error.code || '', r.error.message || '');
    else console.log('META_OK', c.name, c.table);
  }
})();
