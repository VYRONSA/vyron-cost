/**
 * PCP-045 — derives the reset plan from the live schema. READ ONLY.
 *
 * 1. Seeds each module with its root tables.
 * 2. Closes the set under *incoming* references (anything pointing at a doomed
 *    row must go first, or the delete FK-violates).
 * 3. Topologically sorts children-before-parents.
 * 4. Resolves the company scoping expression for every table.
 *
 * Output: reset-plan.json, consumed by the SQL generator.
 */
import fs from 'node:fs'

const schema = JSON.parse(fs.readFileSync('data/generated/schema-introspection.json', 'utf8'))

/** Tables that must never be touched: shared reference, config, identity, platform. */
const PROTECTED = new Set([
  'vyron_cost_companies',
  'vyron_companies',
  'vyron_users',
  'vyron_platform_products',
  'vyron_financial_accounts',
  'vyron_document_approval_rules', // per-tenant configuration
  'vyron_cost_uom',
  'vyron_cost_units',
])
const PROTECTED_RE =
  /(^vyron_(users|user_|auth|roles|role_|permission|platform_|workspace|settings|config)|_settings$|_config$|_permissions$|_roles$|^vyron_cost_companies$|^vyron_companies$)/i

/** Tables with no company/tenant column and no usable parent key — cannot be scoped. */
const UNSCOPABLE = new Set([
  'vyron_cost_email_invoice_queue',
  'vyron_cost_supplier_benchmarks',
  'vyron_cost_supplier_intelligence',
  'vyron_cost_sales_price_lists',
  'vyron_cost_sales_price_list_lines',
])

const MODULE_ROOTS = {
  supplier_invoices: [
    'vyron_documents',
    'vyron_cost_invoice_headers',
    'vyron_cost_supplier_invoices',
    'vyron_supplier_invoice_learning',
    'vyron_supplier_line_item_mappings',
    'vyron_cost_invoice_risk_findings',
    'vyron_supplier_price_history',
  ],
  raw_materials: ['vyron_cost_ingredients', 'vyron_cost_stock_items'],
  finished_goods: ['vyron_cost_products', 'vyron_finished_goods'],
  boms: ['vyron_cost_boms', 'vyron_cost_recipes'],
  production_history: ['vyron_cost_production_runs', 'vyron_cost_store_production_runs'],
  suppliers: ['vyron_cost_suppliers', 'vyron_supplier_profiles', 'vyron_supplier_contracts'],
}

const isProtected = (t) => PROTECTED.has(t) || PROTECTED_RE.test(t)

// reverse index: parent -> [{child, column}]
const referencedBy = new Map()
for (const [name, def] of Object.entries(schema)) {
  for (const fk of def.fks) {
    if (fk.column === 'company_id' || fk.column === 'tenant_id') continue
    if (!referencedBy.has(fk.refTable)) referencedBy.set(fk.refTable, [])
    referencedBy.get(fk.refTable).push({ child: name, column: fk.column })
  }
}

/** Close a seed set under incoming references. */
function close(seed) {
  const set = new Set(seed)
  const queue = [...seed]
  const skipped = []
  while (queue.length) {
    const t = queue.shift()
    for (const { child } of referencedBy.get(t) || []) {
      if (set.has(child)) continue
      if (isProtected(child)) {
        skipped.push({ table: child, reason: 'protected' })
        continue
      }
      if (UNSCOPABLE.has(child)) {
        skipped.push({ table: child, reason: 'unscopable' })
        continue
      }
      set.add(child)
      queue.push(child)
    }
  }
  return { set, skipped }
}

/**
 * Resolve how a table is scoped to a company, as a chain of parent hops ending
 * at a table that carries company_id or tenant_id. Independent of the delete
 * set — a parent need not itself be deleted to scope its children.
 */
function scopeOf(table, _set, depth = 0, seen = new Set()) {
  const cols = Object.keys(schema[table]?.columns || {})
  if (cols.includes('company_id')) return { kind: 'column', column: 'company_id' }
  if (cols.includes('tenant_id')) return { kind: 'column', column: 'tenant_id' }
  if (depth > 3 || seen.has(table)) return { kind: 'none' }
  seen.add(table)

  const candidates = [...(schema[table]?.fks || [])]
  // undeclared FK columns: infer the parent from the column name
  for (const c of cols) {
    if (!c.endsWith('_id') || candidates.some((f) => f.column === c)) continue
    const stem = c.replace(/_id$/, '')
    const guess = Object.keys(schema).find(
      (p) => p === `vyron_cost_${stem}s` || p === `vyron_${stem}s` || p === `vyron_cost_${stem}` || p === `vyron_${stem}`
    )
    if (guess) candidates.push({ column: c, refTable: guess, undeclared: true })
  }

  for (const f of candidates) {
    const parentScope = scopeOf(f.refTable, _set, depth + 1, seen)
    if (parentScope.kind === 'none') continue
    return {
      kind: 'parent',
      column: f.column,
      parent: f.refTable,
      undeclared: !!f.undeclared,
      parentScope,
    }
  }
  return { kind: 'none' }
}

/**
 * Circular FK pairs that must be broken with an UPDATE before deletion.
 * products.linked_bom_id -> boms.id while boms.product_id -> products.id.
 */
const CYCLE_BREAKERS = [
  { table: 'vyron_cost_products', column: 'linked_bom_id', reason: 'products.linked_bom_id <-> boms.product_id' },
]

/** Topological sort: children (referencing) before parents (referenced). */
function order(set) {
  const nodes = [...set]
  const deps = new Map(nodes.map((n) => [n, new Set()])) // n must come before these
  for (const n of nodes) {
    for (const fk of schema[n]?.fks || []) {
      if (fk.column === 'company_id' || fk.column === 'tenant_id') continue
      if (set.has(fk.refTable) && fk.refTable !== n) deps.get(n).add(fk.refTable)
    }
  }
  const out = []
  const seen = new Set()
  const stack = new Set()
  const cycles = []
  const visit = (n) => {
    if (seen.has(n)) return
    if (stack.has(n)) {
      cycles.push(n)
      return
    }
    stack.add(n)
    for (const d of deps.get(n)) visit(d)
    stack.delete(n)
    seen.add(n)
    out.push(n)
  }
  // emit children first: visit dependencies (parents) then push self => parents land first.
  // we want the reverse, so build then reverse.
  for (const n of nodes) visit(n)
  return { order: out.reverse(), cycles: [...new Set(cycles)] }
}

const plan = { modules: {}, protectedSkipped: [], unscopableSkipped: [] }
const allSkipped = new Map()

for (const [mod, roots] of Object.entries(MODULE_ROOTS)) {
  const { set, skipped } = close(roots)
  const { order: ord, cycles } = order(set)
  plan.modules[mod] = {
    roots,
    tables: ord.map((t) => ({ table: t, scope: scopeOf(t, set) })),
    cycleBreakers: CYCLE_BREAKERS.filter((c) => set.has(c.table)),
    cycles,
  }
  for (const s of skipped) allSkipped.set(s.table, s.reason)
}

plan.protectedSkipped = [...allSkipped].filter(([, r]) => r === 'protected').map(([t]) => t)
plan.unscopableSkipped = [...allSkipped].filter(([, r]) => r === 'unscopable').map(([t]) => t)

fs.writeFileSync('data/generated/reset-plan.json', JSON.stringify(plan, null, 2))

for (const [mod, m] of Object.entries(plan.modules)) {
  console.log(`\n===== ${mod}  (${m.tables.length} tables) =====`)
  if (m.cycles.length) console.log('  !! CYCLES:', m.cycles.join(', '))
  for (const { table, scope } of m.tables) {
    const s =
      scope.kind === 'column'
        ? scope.column
        : scope.kind === 'parent'
          ? `via ${scope.column} -> ${scope.parent}${scope.undeclared ? ' (undeclared FK)' : ''}`
          : '!! NONE'
    console.log(`   ${table.padEnd(46)} ${s}`)
  }
}
console.log('\nprotected, never deleted :', plan.protectedSkipped.join(', ') || '(none)')
console.log('unscopable, not deleted  :', plan.unscopableSkipped.join(', ') || '(none)')
