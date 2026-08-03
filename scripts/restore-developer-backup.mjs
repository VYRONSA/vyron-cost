/**
 * PCP-045A — restores a Developer Reset Centre backup.
 *
 *   node scripts/restore-developer-backup.mjs backups/Handcrafted-Food-Products/2026-08-03T19-42-11Z
 *   node scripts/restore-developer-backup.mjs <dir> --execute
 *
 * Dry run by default: reports what would be inserted and re-inserts nothing.
 * Pass --execute to write. Rows are restored in the manifest's restoreOrder,
 * which is the reverse of the delete order, so parents land before children.
 *
 * Restore is idempotent per row: it upserts on the primary key, so re-running
 * after a partial failure repairs rather than duplicates.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const dir = process.argv[2]
const execute = process.argv.includes('--execute')

if (!dir) {
  console.error('usage: node scripts/restore-developer-backup.mjs <backup-dir> [--execute]')
  process.exit(1)
}

for (const line of (await fs.readFile('.env.local', 'utf8')).split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, '')
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Supabase URL and service role key are required.')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'))

console.log('backup     :', dir)
console.log('company    :', manifest.companyId)
console.log('module     :', manifest.module)
console.log('created    :', manifest.createdAt)
console.log('tables     :', manifest.tables)
console.log('rows       :', manifest.rows)
console.log('mode       :', execute ? 'EXECUTE (writes)' : 'DRY RUN (no writes)')
console.log('')

// Guard: never restore into a company that is not the one backed up.
const company = await sb.from('vyron_cost_companies').select('id,name').eq('id', manifest.companyId).maybeSingle()
if (!company.data) {
  console.error(`Refusing to restore: company ${manifest.companyId} no longer exists.`)
  process.exit(1)
}
console.log('target company still present:', company.data.name)
console.log('')

const order = manifest.restoreOrder || manifest.perTable.map((t) => t.table)
let totalRestored = 0
let failures = 0

/**
 * Circular FK: vyron_cost_products.linked_bom_id -> vyron_cost_boms.id while
 * vyron_cost_boms.product_id -> vyron_cost_products.id. The delete breaks this
 * with an UPDATE; the restore must do the same in reverse — insert products
 * with the link nulled, then re-apply it once the BOMs exist.
 */
const DEFERRED_FK = { vyron_cost_products: 'linked_bom_id' }
const deferred = []

/**
 * Generated columns (e.g. vyron_cost_bom_lines.line_cost) reject any supplied
 * value. Postgres names the offending column, so strip it and retry rather than
 * hard-coding a schema-specific list that would drift.
 */
const GENERATED_RE = /cannot insert a non-DEFAULT value into column "([^"]+)"/

async function upsertChunk(table, slice) {
  let payload = slice
  for (let attempt = 0; attempt < 12; attempt++) {
    const { error } = await sb.from(table).upsert(payload, { onConflict: 'id' })
    if (!error) return { ok: true, payload }
    const generated = error.message.match(GENERATED_RE)
    if (!generated) return { ok: false, error }
    const column = generated[1]
    payload = payload.map((row) => {
      const next = { ...row }
      delete next[column]
      return next
    })
  }
  return { ok: false, error: { message: 'too many generated-column retries' } }
}

for (const table of order) {
  let rows
  try {
    rows = JSON.parse(await fs.readFile(path.join(dir, `${table}.json`), 'utf8'))
  } catch {
    console.log(`  ${table.padEnd(48)} (no file — skipped)`)
    continue
  }
  if (!rows.length) {
    console.log(`  ${table.padEnd(48)} 0`)
    continue
  }

  if (!execute) {
    console.log(`  ${table.padEnd(48)} ${rows.length} would be restored`)
    totalRestored += rows.length
    continue
  }

  const deferColumn = DEFERRED_FK[table]
  let payload = rows
  if (deferColumn) {
    for (const row of rows) {
      if (row[deferColumn] != null) deferred.push({ table, id: row.id, column: deferColumn, value: row[deferColumn] })
    }
    payload = rows.map((row) => ({ ...row, [deferColumn]: null }))
  }

  // Chunked upsert: large tables would otherwise exceed the request limit.
  const CHUNK = 500
  let restored = 0
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK)
    const res = await upsertChunk(table, slice)
    if (!res.ok) {
      console.log(`  ${table.padEnd(48)} FAILED at row ${i}: ${res.error.message}`)
      failures++
      break
    }
    restored += slice.length
  }
  if (restored) console.log(`  ${table.padEnd(48)} ${restored} restored`)
  totalRestored += restored
}

// Re-apply the deferred circular references now that both sides exist.
if (execute && deferred.length) {
  let relinked = 0
  for (const d of deferred) {
    const { error } = await sb.from(d.table).update({ [d.column]: d.value }).eq('id', d.id)
    if (error) {
      console.log(`  relink ${d.table}.${d.column} ${d.id}: ${error.message}`)
      failures++
    } else relinked++
  }
  console.log(`  ${'(relinked deferred FKs)'.padEnd(48)} ${relinked}`)
}

console.log('')
console.log(execute ? `restored ${totalRestored} rows` : `dry run — ${totalRestored} rows would be restored`)
if (failures) {
  console.log(`${failures} table(s) failed. Re-run to repair: the upsert is idempotent on the primary key.`)
  process.exit(1)
}
