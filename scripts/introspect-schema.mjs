/**
 * Schema introspection via the PostgREST OpenAPI document. READ ONLY.
 * Emits every exposed table, whether it carries company_id, and its declared
 * foreign keys (PostgREST encodes these in column descriptions).
 */
import fs from 'node:fs'

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, '')
}
const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

const res = await fetch(`${base}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
})
if (!res.ok) {
  console.error('FAILED', res.status, await res.text())
  process.exit(1)
}
const spec = await res.json()

const tables = {}
for (const [name, def] of Object.entries(spec.definitions || {})) {
  const cols = {}
  const fks = []
  for (const [col, meta] of Object.entries(def.properties || {})) {
    cols[col] = meta.format || meta.type
    const d = meta.description || ''
    const m = d.match(/<fk table='([^']+)' column='([^']+)'\/>/)
    if (m) fks.push({ column: col, refTable: m[1], refColumn: m[2] })
    if (/Primary Key/i.test(d)) cols[col] += ' [pk]'
  }
  tables[name] = { columns: cols, fks, hasCompanyId: 'company_id' in cols }
}

fs.writeFileSync('data/generated/schema-introspection.json', JSON.stringify(tables, null, 2))

const names = Object.keys(tables).sort()
console.log('exposed tables:', names.length)
console.log('with company_id:', names.filter((n) => tables[n].hasCompanyId).length)
console.log('')

const filter = process.argv[2]
for (const n of names) {
  if (filter && !new RegExp(filter, 'i').test(n)) continue
  const t = tables[n]
  console.log(`${t.hasCompanyId ? '[co]' : '[--]'} ${n}`)
  for (const f of t.fks) console.log(`        fk ${f.column} -> ${f.refTable}.${f.refColumn}`)
}
