/**
 * Removes test/scaffold tenants created by certification and smoke runs.
 *
 *   node scripts/cleanup-test-tenants.mjs            # dry run, writes nothing
 *   node scripts/cleanup-test-tenants.mjs --execute  # delete
 *
 * KEEP_IDS is an explicit allowlist. Anything in it is never touched, whatever
 * its name looks like. Everything else is deleted, so the allowlist — not the
 * pattern — is what protects real data.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, '')
}
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '')
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const EXECUTE = process.argv.includes('--execute')
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0)

/**
 * Never deleted. Read from data/protected-tenants.json — the same file the
 * Developer Centre uses via src/lib/vyron-protected-tenants.ts, so the CLI and
 * the UI cannot protect different sets of tenants.
 */
const protectedFile = JSON.parse(fs.readFileSync('data/protected-tenants.json', 'utf8'))
const KEEP_IDS = new Set(protectedFile.protectedCompanyIds.map((t) => t.companyId))

const companies = (await sb.from('vyron_cost_companies').select('id,name,trading_name')).data || []
const workspaces = (await sb.from('vyron_workspaces').select('id,company_id,company_name,status')).data || []

const keep = companies.filter((c) => KEEP_IDS.has(c.id))
let doomed = companies.filter((c) => !KEEP_IDS.has(c.id))
if (LIMIT) doomed = doomed.slice(0, LIMIT)

console.log('companies total :', companies.length)
console.log('  KEEP          :', keep.length)
for (const c of keep) console.log('     ', c.id, '|', c.name)
console.log('  DELETE        :', doomed.length)
console.log('workspaces total:', workspaces.length)

const doomedIds = new Set(doomed.map((c) => c.id))
const doomedWorkspaces = workspaces.filter((w) => doomedIds.has(w.company_id))
const keptWorkspaces = workspaces.filter((w) => KEEP_IDS.has(w.company_id))
const orphanWorkspaces = workspaces.filter((w) => !w.company_id || (!doomedIds.has(w.company_id) && !KEEP_IDS.has(w.company_id)))

console.log('  workspaces to delete :', doomedWorkspaces.length)
console.log('  workspaces to keep   :', keptWorkspaces.length)
for (const w of keptWorkspaces) console.log('     ', w.id, '|', w.company_name, '| status', w.status)
if (orphanWorkspaces.length) console.log('  workspaces with no matching company (left alone):', orphanWorkspaces.length)

if (!EXECUTE) {
  console.log('\nDRY RUN — nothing written. Re-run with --execute.')
  process.exit(0)
}

console.log('\n--- executing ---')
let wsDeleted = 0
let memDeleted = 0
let coDeleted = 0
const failures = []

for (const w of doomedWorkspaces) {
  const mem = await sb.from('vyron_workspace_memberships').delete().eq('workspace_id', w.id).select('id')
  if (mem.error) {
    failures.push(`memberships ${w.id}: ${mem.error.message}`)
    continue
  }
  memDeleted += (mem.data || []).length

  const del = await sb.from('vyron_workspaces').delete().eq('id', w.id).select('id')
  if (del.error) failures.push(`workspace ${w.id} (${w.company_name}): ${del.error.message}`)
  else wsDeleted += (del.data || []).length
}

for (const c of doomed) {
  // Clear operational data first; the reset function handles FK order in one transaction.
  const reset = await sb.rpc('vyron_dev_reset_execute', {
    p_company_id: c.id,
    p_module: 'factory',
    p_actor_user_id: 'cleanup',
    p_actor_email: 'cleanup@vyron',
    p_reason: 'PCP-046 test tenant cleanup',
    p_backup_created: false,
    p_backup_location: null,
    p_backup_acknowledged_without: true,
  })
  if (reset.error) failures.push(`reset ${c.id} (${c.name}): ${reset.error.message}`)

  const del = await sb.from('vyron_cost_companies').delete().eq('id', c.id).select('id')
  if (del.error) failures.push(`company ${c.id} (${c.name}): ${del.error.message}`)
  else coDeleted += (del.data || []).length
}

console.log('memberships deleted :', memDeleted)
console.log('workspaces deleted  :', wsDeleted)
console.log('companies deleted   :', coDeleted)
console.log('failures            :', failures.length)
for (const f of failures.slice(0, 15)) console.log('   ', f)

const after = await sb.from('vyron_cost_companies').select('id,name')
const afterWs = await sb.from('vyron_workspaces').select('id,company_name,status')
console.log('\nremaining companies :', (after.data || []).length)
for (const c of after.data || []) console.log('   ', c.id, '|', c.name)
console.log('remaining workspaces:', (afterWs.data || []).length)
for (const w of afterWs.data || []) console.log('   ', w.id, '|', w.company_name, '| status', w.status)
