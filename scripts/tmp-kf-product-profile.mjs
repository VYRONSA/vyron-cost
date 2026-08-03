/**
 * Kingdom Foods product profile — READ ONLY.
 * Applies the agreed normalisation rules to the live snapshot and reports
 * duplicate groups, excluded CERT/TEST/DEMO rows, and BOM/history completeness.
 * Writes nothing. Touches no database.
 */
import fs from 'node:fs'
import path from 'node:path'

const SNAP = 'backups/kingdom-foods-20260803T112905Z'
const read = (f) => JSON.parse(fs.readFileSync(path.join(SNAP, f), 'utf8'))

const products = read('vyron_cost_products.json')
const boms = read('vyron_cost_boms.json')
const bomLines = read('vyron_cost_bom_lines.json')
const costLines = read('vyron_cost_product_cost_lines.json')

// ---- normalisation -------------------------------------------------------
const UNIT_CANON = new Map([
  ['G', 'G'], ['GR', 'G'], ['GRS', 'G'], ['GRAM', 'G'], ['GRAMS', 'G'],
  ['KG', 'KG'], ['KGS', 'KG'], ['KGM', 'KG'],
  ['ML', 'ML'], ['L', 'L'], ['LT', 'L'], ['LTR', 'L'],
])
const UNIT_ALT = [...UNIT_CANON.keys()].sort((a, b) => b.length - a.length).join('|')
const WEIGHT_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_ALT})(?![A-Z0-9])`, 'g')

export function normalise(raw) {
  if (!raw) return { key: '', base: '', weights: [] }
  let s = String(raw).toUpperCase()

  // brackets and their punctuation -> space
  s = s.replace(/[()\[\]{}]/g, ' ')
  // hyphens -> space (so "PIE-150GR" splits)
  s = s.replace(/[-‐-―_/\\]/g, ' ')

  // pull weights out, canonicalising the unit
  const weights = []
  s = s.replace(WEIGHT_RE, (_m, num, unit) => {
    const n = num.replace(',', '.').replace(/\.0+$/, '')
    weights.push(`${n}${UNIT_CANON.get(unit)}`)
    return ' '
  })

  // remaining punctuation -> space, collapse spaces
  s = s.replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

  weights.sort()
  const base = s
  const key = [base, ...weights].filter(Boolean).join(' ').trim()
  return { key, base, weights }
}

// ---- classification ------------------------------------------------------
const NOISE_RE = /\b(CERT|TEST|DEMO|SMOKE|FIXTURE|SAMPLE|DUMMY)\b|^SO PRODUCT |^PERF |\bE2E\b/i
const isNoise = (p) =>
  NOISE_RE.test(p.product_name || '') ||
  p.is_demo === true ||
  !!p.demo_seed_key ||
  /cert|test|demo/i.test(p.status || '') ||
  /cert|test|demo/i.test(p.product_status || '')

// ---- completeness signals -----------------------------------------------
const bomById = new Map(boms.map((b) => [b.id, b]))
const bomLineCount = new Map()
for (const l of bomLines) bomLineCount.set(l.bom_id, (bomLineCount.get(l.bom_id) || 0) + 1)

const costLineByProductId = new Map()
const costLineByName = new Map()
for (const l of costLines) {
  if (l.product_id) costLineByProductId.set(l.product_id, (costLineByProductId.get(l.product_id) || 0) + 1)
  const n = (l.product_name || '').trim().toUpperCase()
  if (n) costLineByName.set(n, (costLineByName.get(n) || 0) + 1)
}

function completeness(p) {
  const bom = p.linked_bom_id ? bomById.get(p.linked_bom_id) : null
  const bomLines = bom ? bomLineCount.get(bom.id) || 0 : 0
  const cost =
    (costLineByProductId.get(p.id) || 0) ||
    (costLineByName.get((p.product_name || '').trim().toUpperCase()) || 0)
  return {
    bomLines,
    costLines: cost,
    extracted: p.extracted_line_count || 0,
    hasPrice: Number(p.selling_price) > 0 || Number(p.total_cost) > 0,
    // ranking score: BOM depth dominates, then costing history, then extraction
    score: bomLines * 1000 + cost * 10 + (p.extracted_line_count || 0),
  }
}

// ---- build groups --------------------------------------------------------
// Identity is scoped by company_id — the live index is (company_id, lower(product_name)).
// Grouping across tenants would merge unrelated companies' products.
const TENANT = process.argv[2]
if (!TENANT) {
  console.error('usage: node scripts/tmp-kf-product-profile.mjs <company_id>')
  process.exit(1)
}
const scoped = products.filter((p) => p.company_id === TENANT)

const noise = []
const live = []
for (const p of scoped) (isNoise(p) ? noise : live).push(p)

const groups = new Map()
for (const p of live) {
  const { key, base, weights } = normalise(p.product_name)
  if (!key) continue
  if (!groups.has(key)) groups.set(key, { key, base, weights, rows: [] })
  groups.get(key).rows.push(p)
}

const dupes = [...groups.values()].filter((g) => g.rows.length > 1)
dupes.sort((a, b) => b.rows.length - a.rows.length || a.key.localeCompare(b.key))

// products whose normalised name carries no weight token
const noWeight = [...groups.values()].filter((g) => g.weights.length === 0)

// ---- report --------------------------------------------------------------
const L = []
const say = (s = '') => L.push(s)

say('KINGDOM FOODS — PRODUCT PROFILE (read-only, no database writes)')
say('snapshot: ' + SNAP)
say('')
say('tenant  : ' + TENANT)
say('')
say('Total product rows                : ' + scoped.length)
say('  CERT / TEST / DEMO (excluded)   : ' + noise.length)
say('  Live products considered        : ' + live.length)
say('  Distinct normalised names       : ' + groups.size)
say('  Normalised names with >1 row    : ' + dupes.length)
say('  Live rows inside duplicate sets : ' + dupes.reduce((n, g) => n + g.rows.length, 0))
say('  Redundant rows to retire        : ' + dupes.reduce((n, g) => n + g.rows.length - 1, 0))
say('  Normalised names without weight : ' + noWeight.length)
say('')
say('BOM coverage of live products')
const withBom = live.filter((p) => p.linked_bom_id && (bomLineCount.get(p.linked_bom_id) || 0) > 0)
say('  live products with a non-empty BOM : ' + withBom.length + ' / ' + live.length)
say('  BOM headers in snapshot            : ' + boms.length)
say('  BOM lines in snapshot              : ' + bomLines.length)
say('')

say('=== DUPLICATE GROUPS (canonical = most complete BOM + history) ===')
say('')
for (const g of dupes) {
  const ranked = g.rows
    .map((p) => ({ p, c: completeness(p) }))
    .sort((a, b) => b.c.score - a.c.score || String(a.p.created_at).localeCompare(String(b.p.created_at)))
  const tie = ranked.length > 1 && ranked[0].c.score === ranked[1].c.score
  say(`[${g.key}]  ${g.rows.length} rows${tie ? '   *** TIE — needs manual decision ***' : ''}`)
  ranked.forEach((r, i) => {
    const role = i === 0 ? (tie ? 'AMBIGUOUS' : 'CANONICAL') : 'retire   '
    say(
      `   ${role}  "${r.p.product_name}"` +
        `\n              id=${r.p.id}  bomLines=${r.c.bomLines}  costLines=${r.c.costLines}` +
        `  extracted=${r.c.extracted}  priced=${r.c.hasPrice ? 'y' : 'n'}  created=${String(r.p.created_at).slice(0, 10)}`
    )
  })
  say('')
}

say('=== EXCLUDED CERT / TEST / DEMO ROWS (reported, never matched) ===')
say('')
const noiseNames = new Map()
for (const p of noise) {
  const k = (p.product_name || '').replace(/\d{6,}/g, '<n>').trim()
  noiseNames.set(k, (noiseNames.get(k) || 0) + 1)
}
;[...noiseNames.entries()].sort((a, b) => b[1] - a[1]).forEach(([n, c]) => say(`   ${String(c).padStart(4)}  ${n}`))

const out = L.join('\n')
fs.writeFileSync(process.env.OUT || 'kf-product-profile.txt', out)
console.log(out)
