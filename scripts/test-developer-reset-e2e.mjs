/**
 * PCP-045A — end-to-end rehearsal of the Developer Reset Centre.
 *
 *   node scripts/test-developer-reset-e2e.mjs --company <uuid>            # read-only preflight
 *   node scripts/test-developer-reset-e2e.mjs --company <uuid> --execute  # full destructive loop
 *
 * Full loop: baseline -> backup -> restore dry-run -> reset -> verify empty
 *            -> restore -> verify restored matches baseline.
 *
 * Exercises the same RPCs the API routes call, so a pass here means the
 * database contract the application depends on is sound.
 *
 * Refuses to run --execute against any company whose name is not an FG Test /
 * disposable tenant unless --allow-real is also passed.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const argv = process.argv.slice(2)
const arg = (flag) => {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : null
}
const COMPANY = arg('--company')
const MODULE = arg('--module') || 'factory'
const EXECUTE = argv.includes('--execute')
const ALLOW_REAL = argv.includes('--allow-real')

if (!COMPANY) {
  console.error('usage: node scripts/test-developer-reset-e2e.mjs --company <uuid> [--module factory] [--execute]')
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
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const plan = JSON.parse(await fs.readFile('data/generated/reset-plan.json', 'utf8'))
const FACTORY_SEQ = ['production_history', 'supplier_invoices', 'boms', 'finished_goods', 'raw_materials', 'suppliers']
const moduleTables =
  MODULE === 'factory'
    ? [...new Set(FACTORY_SEQ.flatMap((m) => plan.modules[m].tables.map((t) => t.table)))]
    : plan.modules[MODULE].tables.map((t) => t.table)

let failures = 0
const step = (n, title) => console.log(`\n───── ${n}. ${title}`)
const ok = (msg) => console.log(`   PASS  ${msg}`)
const bad = (msg) => {
  console.log(`   FAIL  ${msg}`)
  failures++
}

/* ------------------------------------------------------------ preflight */
step(0, 'Preflight')

const company = await sb.from('vyron_cost_companies').select('id,name').eq('id', COMPANY).maybeSingle()
if (!company.data) {
  bad(`company ${COMPANY} not found`)
  process.exit(1)
}
console.log(`   company: ${company.data.name}`)

const disposable = /^(FG|MDA|Proc|SO|PO|MFG|PS|GP|OSI|PLI|Perm|Recipes|Probe|Deploy|Baseline|Verify|Count|Invoice|Balance|Stock)\b|Test|Workflow|Hardening/i.test(
  company.data.name
)
if (EXECUTE && !disposable && !ALLOW_REAL) {
  bad(`refusing --execute against "${company.data.name}" — not a disposable test tenant. Pass --allow-real to override.`)
  process.exit(1)
}

const probe = await sb.rpc('vyron_dev_reset_preview', { p_company_id: COMPANY, p_module: MODULE })
if (probe.error) {
  bad(`reset functions not installed (${probe.error.code}: ${probe.error.message})`)
  console.log('\n   Apply supabase/pcp-045-developer-reset-centre.sql, then re-run.')
  process.exit(1)
}
ok('vyron_dev_reset_preview responds')

const exportProbe = await sb.rpc('vyron_dev_reset_export_table', {
  p_company_id: COMPANY,
  p_table: 'vyron_cost_products',
})
if (exportProbe.error) bad(`export function failed: ${exportProbe.error.message}`)
else ok('vyron_dev_reset_export_table responds')

/* ------------------------------------------------------------ baseline */
step(1, 'Baseline')
const baseline = Object.fromEntries((probe.data || []).filter((r) => Number(r.row_count) > 0).map((r) => [r.table_name, Number(r.row_count)]))
const baselineTotal = Object.values(baseline).reduce((a, b) => a + b, 0)
console.log(`   ${Object.keys(baseline).length} tables, ${baselineTotal} rows in scope`)
for (const [t, n] of Object.entries(baseline)) console.log(`      ${t.padEnd(46)} ${n}`)
if (!baselineTotal) {
  bad('nothing in scope — pick a tenant with data or the test proves nothing')
  process.exit(1)
}

/* ------------------------------------------------------------ guard check */
step(2, 'Backup guard refuses a reset with no backup and no acknowledgement')
const refused = await sb.rpc('vyron_dev_reset_execute', {
  p_company_id: COMPANY,
  p_module: MODULE,
  p_actor_user_id: 'e2e',
  p_actor_email: 'e2e@test',
  p_reason: 'e2e guard check',
  p_backup_created: false,
  p_backup_location: null,
  p_backup_acknowledged_without: false,
})
if (refused.error && /refused: no backup/.test(refused.error.message)) ok('reset refused as designed')
else if (refused.error) bad(`refused for the wrong reason: ${refused.error.message}`)
else bad('RESET RAN WITHOUT A BACKUP — the guard did not fire')

const afterGuard = await sb.rpc('vyron_dev_reset_preview', { p_company_id: COMPANY, p_module: MODULE })
const afterGuardTotal = (afterGuard.data || []).reduce((s, r) => s + Number(r.row_count), 0)
if (afterGuardTotal === baselineTotal) ok('no rows lost to the refused attempt')
else bad(`row count changed after a refused reset: ${baselineTotal} -> ${afterGuardTotal}`)

if (!EXECUTE) {
  console.log('\n───── dry run complete (no backup taken, no reset run). Re-run with --execute for the full loop.')
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll preflight checks passed.')
  process.exit(failures ? 1 : 0)
}

/* ------------------------------------------------------------ backup */
step(3, 'Backup')
const slug =
  String(company.data.name).normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-') ||
  'company'
const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')
const relative = `backups/${slug}/${stamp}`
const absolute = path.join(process.cwd(), 'backups', slug, stamp)
await fs.mkdir(absolute, { recursive: true })

const restoreOrder = [...moduleTables].reverse()
const perTable = []
let backupRows = 0
let backupBytes = 0
const backupStart = Date.now()

for (const table of restoreOrder) {
  const r = await sb.rpc('vyron_dev_reset_export_table', { p_company_id: COMPANY, p_table: table })
  if (r.error) {
    bad(`export ${table}: ${r.error.message}`)
    continue
  }
  const rows = r.data || []
  const json = JSON.stringify(rows, null, 1)
  await fs.writeFile(path.join(absolute, `${table}.json`), json, 'utf8')
  perTable.push({ table, rows: rows.length, bytes: Buffer.byteLength(json) })
  backupRows += rows.length
  backupBytes += Buffer.byteLength(json)
}

const manifest = {
  location: relative,
  companyId: COMPANY,
  companySlug: slug,
  module: MODULE,
  createdAt: new Date().toISOString(),
  tables: perTable.length,
  rows: backupRows,
  bytes: backupBytes,
  durationMs: Date.now() - backupStart,
  perTable,
  restoreOrder,
}
await fs.writeFile(path.join(absolute, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
console.log(`   ${perTable.length} files, ${backupRows} rows, ${(backupBytes / 1024).toFixed(1)} KB -> ${relative}`)

if (backupRows === baselineTotal) ok(`backup row count matches preview (${backupRows})`)
else bad(`backup captured ${backupRows} rows but preview said ${baselineTotal}`)

/* ------------------------------------------------------------ restore dry-run */
step(4, 'Restore dry-run')
const dry = spawnSync('node', ['scripts/restore-developer-backup.mjs', relative], { encoding: 'utf8' })
process.stdout.write(dry.stdout.split('\n').map((l) => '   ' + l).join('\n'))
if (dry.status === 0 && /would be restored/.test(dry.stdout)) ok('dry run reports rows without writing')
else bad(`dry run failed (exit ${dry.status})`)

/* ------------------------------------------------------------ reset */
step(5, 'Reset')
const exec = await sb.rpc('vyron_dev_reset_execute', {
  p_company_id: COMPANY,
  p_module: MODULE,
  p_actor_user_id: 'e2e',
  p_actor_email: 'e2e@test',
  p_reason: 'PCP-045A end-to-end rehearsal',
  p_backup_created: true,
  p_backup_location: relative,
  p_backup_acknowledged_without: false,
})
if (exec.error) {
  bad(`reset failed: ${exec.error.message}`)
} else {
  console.log(`   deleted ${exec.data.total_rows_deleted} rows in ${exec.data.duration_ms} ms`)
  if (exec.data.total_rows_deleted === baselineTotal) ok('deleted exactly the previewed row count')
  else bad(`deleted ${exec.data.total_rows_deleted}, expected ${baselineTotal}`)
}

/* ------------------------------------------------------------ verify empty */
step(6, 'Verify clean')
const after = await sb.rpc('vyron_dev_reset_preview', { p_company_id: COMPANY, p_module: MODULE })
const remaining = (after.data || []).filter((r) => Number(r.row_count) > 0)
if (!remaining.length) ok('0 rows remain in module scope')
else {
  bad(`${remaining.length} table(s) still hold rows`)
  for (const r of remaining) console.log(`      ${r.table_name}: ${r.row_count}`)
}

const auditRow = await sb
  .from('vyron_dev_reset_audit')
  .select('module,backup_created,backup_location,total_rows_deleted')
  .eq('company_id', COMPANY)
  .order('created_at', { ascending: false })
  .limit(1)
if (auditRow.data?.[0]?.backup_created && auditRow.data[0].backup_location === relative) ok('audit row records the backup location')
else bad(`audit row wrong: ${JSON.stringify(auditRow.data?.[0])}`)

/* ------------------------------------------------------------ restore */
step(7, 'Restore')
const restore = spawnSync('node', ['scripts/restore-developer-backup.mjs', relative, '--execute'], { encoding: 'utf8' })
process.stdout.write(restore.stdout.split('\n').map((l) => '   ' + l).join('\n'))
if (restore.status !== 0) bad(`restore failed (exit ${restore.status})`)

/* ------------------------------------------------------------ verify restored */
step(8, 'Verify restored')
const restored = await sb.rpc('vyron_dev_reset_preview', { p_company_id: COMPANY, p_module: MODULE })
const restoredCounts = Object.fromEntries((restored.data || []).filter((r) => Number(r.row_count) > 0).map((r) => [r.table_name, Number(r.row_count)]))
const restoredTotal = Object.values(restoredCounts).reduce((a, b) => a + b, 0)

if (restoredTotal === baselineTotal) ok(`restored ${restoredTotal} rows, matching baseline`)
else bad(`restored ${restoredTotal} rows, baseline was ${baselineTotal}`)

for (const [t, n] of Object.entries(baseline)) {
  if (restoredCounts[t] !== n) bad(`${t}: baseline ${n}, restored ${restoredCounts[t] ?? 0}`)
}

console.log(failures ? `\n═════ ${failures} FAILURE(S)` : '\n═════ ALL CHECKS PASSED')
process.exit(failures ? 1 : 0)
