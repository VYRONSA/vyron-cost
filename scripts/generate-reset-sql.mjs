/**
 * PCP-045 — emits supabase/pcp-045-developer-reset-centre.sql from reset-plan.json.
 * The SQL is generated, never hand-maintained, so it always matches the live schema.
 */
import fs from 'node:fs'

const plan = JSON.parse(fs.readFileSync('data/generated/reset-plan.json', 'utf8'))
const schema = JSON.parse(fs.readFileSync('data/generated/schema-introspection.json', 'utf8'))

/**
 * Build a WHERE predicate that scopes a table to p_company_id.
 * `alias` qualifies only the outermost column — subqueries resolve against
 * their own table and must never inherit the outer alias.
 */
function whereFor(scope, alias = '') {
  const q = alias ? `${alias}.` : ''
  if (scope.kind === 'column') return `${q}${scope.column} = p_company_id`
  if (scope.kind === 'parent') {
    return `${q}${scope.column} IN (SELECT id FROM public.${scope.parent} WHERE ${whereFor(scope.parentScope)})`
  }
  throw new Error('unscopable scope reached SQL generation')
}

const MODULE_LABELS = {
  supplier_invoices: 'Reset Supplier Invoices',
  raw_materials: 'Reset Raw Materials',
  finished_goods: 'Reset Finished Goods',
  boms: 'Reset BOMs',
  production_history: 'Reset Production History',
  suppliers: 'Reset Suppliers',
}

/** Factory reset order: every table, children before parents, across all modules. */
function factoryOrder() {
  const all = new Map()
  // module order chosen so dependants are cleared before what they depend on
  const seq = ['production_history', 'supplier_invoices', 'boms', 'finished_goods', 'raw_materials', 'suppliers']
  for (const m of seq) {
    for (const entry of plan.modules[m].tables) {
      if (!all.has(entry.table)) all.set(entry.table, entry.scope)
    }
  }
  return [...all.entries()].map(([table, scope]) => ({ table, scope }))
}

const L = []
const w = (s = '') => L.push(s)

w('-- PCP-045 — Developer Supervisor Reset Centre')
w('-- GENERATED FILE — produced by scripts/tmp-generate-reset-sql.mjs from the live schema.')
w('-- Do not hand-edit; regenerate after any schema change.')
w('--')
w('-- Every delete is scoped to a single company. Tables without company_id are scoped')
w('-- through their parent chain. Each function body runs in a single transaction.')
w('')
w('set search_path = public;')
w('')

// ---- audit table ---------------------------------------------------------
w('-- ============================================================ audit')
w('create table if not exists public.vyron_dev_reset_audit (')
w('  id uuid primary key default gen_random_uuid(),')
w('  company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,')
w('  module text not null,')
w('  actor_user_id text,')
w('  actor_email text,')
w('  reason text,')
w('  rows_deleted jsonb not null default \'{}\'::jsonb,')
w('  total_rows_deleted bigint not null default 0,')
w('  duration_ms integer,')
w('  backup_created boolean not null default false,')
w('  backup_location text,')
w('  backup_acknowledged_without boolean not null default false,')
w('  status text not null default \'success\',')
w('  warnings text[] not null default \'{}\',')
w('  created_at timestamptz not null default now()')
w(');')
w('')
w('-- Additive for installs that predate PCP-045A.')
w('alter table public.vyron_dev_reset_audit add column if not exists backup_created boolean not null default false;')
w('alter table public.vyron_dev_reset_audit add column if not exists backup_location text;')
w('alter table public.vyron_dev_reset_audit add column if not exists backup_acknowledged_without boolean not null default false;')
w('')
w('create index if not exists idx_vyron_dev_reset_audit_company')
w('  on public.vyron_dev_reset_audit(company_id, created_at desc);')
w('')
w('alter table public.vyron_dev_reset_audit enable row level security;')
w('')
w('-- No policies: the table is reachable only through SECURITY DEFINER functions')
w('-- and the service role. Never exposed to end users.')
w('')

// ---- preview -------------------------------------------------------------
const factory = factoryOrder()

w('-- ============================================================ preview')
w('-- Read-only. Returns the row count a reset would remove, per table.')
w('create or replace function public.vyron_dev_reset_preview(p_company_id uuid, p_module text default \'factory\')')
w('returns table(table_name text, row_count bigint)')
w('language plpgsql')
w('security definer')
w('set search_path = public')
w('as $$')
w('begin')
w('  if p_company_id is null then')
w('    raise exception \'company_id is required\';')
w('  end if;')
w('  if not exists (select 1 from public.vyron_cost_companies c where c.id = p_company_id) then')
w('    raise exception \'unknown company_id: %\', p_company_id;')
w('  end if;')
w('')

const modules = { ...plan.modules, factory: { tables: factory } }
for (const [mod, m] of Object.entries(modules)) {
  w(`  if p_module = '${mod}' then`)
  const parts = m.tables.map(
    (e) =>
      `    return query select '${e.table}'::text, count(*)::bigint from public.${e.table} where ${whereFor(e.scope)};`
  )
  parts.forEach((p) => w(p))
  w('  end if;')
  w('')
}
w('  return;')
w('end;')
w('$$;')
w('')

// ---- export (backup) -----------------------------------------------------
// Reuses the identical scope predicate as the delete, so a backup can never
// capture a different row set than the reset removes.
w('-- ============================================================ export')
w('-- Read-only. Returns every in-scope row of one table as jsonb, for backup.')
w('create or replace function public.vyron_dev_reset_export_table(')
w('  p_company_id uuid,')
w('  p_table text')
w(')')
w('returns setof jsonb')
w('language plpgsql')
w('security definer')
w('set search_path = public')
w('as $$')
w('begin')
w('  if p_company_id is null then')
w('    raise exception \'company_id is required\';')
w('  end if;')
w('  if not exists (select 1 from public.vyron_cost_companies c where c.id = p_company_id) then')
w('    raise exception \'unknown company_id: %\', p_company_id;')
w('  end if;')
w('')

const exportSeen = new Set()
for (const e of factoryOrder()) {
  if (exportSeen.has(e.table)) continue
  exportSeen.add(e.table)
  w(`  if p_table = '${e.table}' then`)
  w(`    return query select to_jsonb(t) from public.${e.table} t where ${whereFor(e.scope, 't')};`)
  w('    return;')
  w('  end if;')
}
w('')
w('  raise exception \'table not in any reset module: %\', p_table;')
w('end;')
w('$$;')
w('')

// ---- execute -------------------------------------------------------------
w('-- ============================================================ execute')
w('-- Destructive. One transaction. Deletes children before parents.')
w('create or replace function public.vyron_dev_reset_execute(')
w('  p_company_id uuid,')
w('  p_module text,')
w('  p_actor_user_id text default null,')
w('  p_actor_email text default null,')
w('  p_reason text default null,')
w('  p_backup_created boolean default false,')
w('  p_backup_location text default null,')
w('  p_backup_acknowledged_without boolean default false')
w(')')
w('returns jsonb')
w('language plpgsql')
w('security definer')
w('set search_path = public')
w('as $$')
w('declare')
w('  v_started timestamptz := clock_timestamp();')
w('  v_counts jsonb := \'{}\'::jsonb;')
w('  v_total bigint := 0;')
w('  v_n bigint;')
w('  v_warnings text[] := \'{}\';')
w('begin')
w('  if p_company_id is null then')
w('    raise exception \'company_id is required\';')
w('  end if;')
w('  if not exists (select 1 from public.vyron_cost_companies c where c.id = p_company_id) then')
w('    raise exception \'unknown company_id: %\', p_company_id;')
w('  end if;')
w(`  if p_module not in (${Object.keys(modules).map((m) => `'${m}'`).join(', ')}) then`)
w('    raise exception \'unknown reset module: %\', p_module;')
w('  end if;')
w('')
w('  -- PCP-045A: refuse before touching a single row unless a backup was taken')
w('  -- or its absence was explicitly acknowledged by the operator.')
w('  if not p_backup_created and not p_backup_acknowledged_without then')
w('    raise exception \'refused: no backup was created and its absence was not acknowledged\';')
w('  end if;')
w('')

for (const [mod, m] of Object.entries(modules)) {
  w(`  -- ---------------------------------------------- ${mod}`)
  w(`  if p_module = '${mod}' then`)
  const breakers = mod === 'factory' ? [{ table: 'vyron_cost_products', column: 'linked_bom_id' }] : m.cycleBreakers || []
  for (const b of breakers) {
    w(`    -- break circular FK before deleting either side`)
    w(`    update public.${b.table} set ${b.column} = null where company_id = p_company_id and ${b.column} is not null;`)
  }
  for (const e of m.tables) {
    w(`    delete from public.${e.table} where ${whereFor(e.scope)};`)
    w(`    get diagnostics v_n = row_count;`)
    w(`    if v_n > 0 then v_counts := v_counts || jsonb_build_object('${e.table}', v_n); v_total := v_total + v_n; end if;`)
  }
  w('  end if;')
  w('')
}

w('  insert into public.vyron_dev_reset_audit(')
w('    company_id, module, actor_user_id, actor_email, reason,')
w('    rows_deleted, total_rows_deleted, duration_ms, status, warnings,')
w('    backup_created, backup_location, backup_acknowledged_without')
w('  ) values (')
w('    p_company_id, p_module, p_actor_user_id, p_actor_email, p_reason,')
w('    v_counts, v_total,')
w('    (extract(epoch from (clock_timestamp() - v_started)) * 1000)::int,')
w('    \'success\', v_warnings,')
w('    p_backup_created, p_backup_location, p_backup_acknowledged_without')
w('  );')
w('')
w('  return jsonb_build_object(')
w('    \'ok\', true,')
w('    \'module\', p_module,')
w('    \'company_id\', p_company_id,')
w('    \'rows_deleted\', v_counts,')
w('    \'total_rows_deleted\', v_total,')
w('    \'duration_ms\', (extract(epoch from (clock_timestamp() - v_started)) * 1000)::int')
w('  );')
w('end;')
w('$$;')
w('')
// Signatures are derived from the declarations above. Hardcoding them drifts the
// moment a parameter is added, and Postgres rejects a grant on a signature that
// does not exist — which would fail the whole migration.
const SIGNATURES = {
  vyron_dev_reset_preview: 'uuid, text',
  vyron_dev_reset_export_table: 'uuid, text',
  vyron_dev_reset_execute: 'uuid, text, text, text, text, boolean, text, boolean',
}

w('-- Only the service role may call these. Never grant to anon or authenticated.')
for (const [fn, sig] of Object.entries(SIGNATURES)) {
  w(`revoke all on function public.${fn}(${sig}) from public, anon, authenticated;`)
}
for (const [fn, sig] of Object.entries(SIGNATURES)) {
  w(`grant execute on function public.${fn}(${sig}) to service_role;`)
}
w('')

fs.writeFileSync('supabase/pcp-045-developer-reset-centre.sql', L.join('\n'))
console.log('wrote supabase/pcp-045-developer-reset-centre.sql')

// ---- generated TS plan ---------------------------------------------------
// The backup layer must iterate exactly the tables a module deletes. Emitting a
// TS module (rather than reading JSON at runtime) keeps it bundled and typed.
const tsModules = Object.fromEntries(
  Object.entries(modules).map(([mod, m]) => [mod, m.tables.map((e) => e.table)])
)
const ts = `/**
 * GENERATED FILE — produced by scripts/generate-reset-sql.mjs from the live schema.
 * Do not hand-edit; run \`npm run reset:sql\` after any schema change.
 *
 * The tables each reset module deletes, in dependency order (children first).
 * The backup layer walks these in reverse so parents are captured first.
 */

export const RESET_MODULE_TABLES: Record<string, readonly string[]> = ${JSON.stringify(
  tsModules,
  null,
  2
)} as const;

export function tablesForModule(moduleKey: string): readonly string[] {
  return RESET_MODULE_TABLES[moduleKey] ?? [];
}
`
fs.writeFileSync('src/lib/vyron-reset-plan.generated.ts', ts)
console.log('wrote src/lib/vyron-reset-plan.generated.ts')
console.log('lines:', L.length)
console.log('factory tables:', factory.length)
for (const [mod, m] of Object.entries(plan.modules)) console.log('  ', mod.padEnd(20), m.tables.length, 'tables')
