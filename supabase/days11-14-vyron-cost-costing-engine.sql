-- VYRON COST DAYS 11-14 COSTING ENGINE PACK
-- Run after previous SQL packs.

create table if not exists public.vyron_cost_recipe_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  recipe_id uuid references public.vyron_cost_recipes(id) on delete cascade,
  ingredient_id uuid references public.vyron_cost_ingredients(id) on delete set null,
  ingredient_name_snapshot text not null,
  quantity numeric(12,3) not null default 0,
  unit text not null default 'kg',
  true_unit_cost numeric(12,2) not null default 0,
  line_cost numeric(12,2) generated always as (quantity * true_unit_cost) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_product_recipe_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  product_id uuid references public.vyron_cost_products(id) on delete cascade,
  recipe_id uuid references public.vyron_cost_recipes(id) on delete cascade,
  recipe_name_snapshot text not null,
  portion_qty numeric(12,3) not null default 1,
  portion_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vyron_cost_batch_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.vyron_cost_companies(id) on delete cascade,
  recipe_id uuid references public.vyron_cost_recipes(id) on delete set null,
  batch_number text not null,
  recipe_name_snapshot text not null,
  planned_yield numeric(12,3) not null default 0,
  actual_yield numeric(12,3) not null default 0,
  planned_cost numeric(12,2) not null default 0,
  actual_cost numeric(12,2) not null default 0,
  variance numeric(12,2) generated always as (actual_cost - planned_cost) stored,
  status text not null default 'Planned',
  created_at timestamptz not null default now()
);

alter table public.vyron_cost_recipe_items enable row level security;
alter table public.vyron_cost_product_recipe_links enable row level security;
alter table public.vyron_cost_batch_runs enable row level security;

drop policy if exists "demo read recipe items" on public.vyron_cost_recipe_items;
drop policy if exists "demo write recipe items" on public.vyron_cost_recipe_items;
drop policy if exists "demo read product recipe links" on public.vyron_cost_product_recipe_links;
drop policy if exists "demo write product recipe links" on public.vyron_cost_product_recipe_links;
drop policy if exists "demo read batch runs" on public.vyron_cost_batch_runs;
drop policy if exists "demo write batch runs" on public.vyron_cost_batch_runs;

create policy "demo read recipe items" on public.vyron_cost_recipe_items for select using (true);
create policy "demo write recipe items" on public.vyron_cost_recipe_items for all using (true) with check (true);
create policy "demo read product recipe links" on public.vyron_cost_product_recipe_links for select using (true);
create policy "demo write product recipe links" on public.vyron_cost_product_recipe_links for all using (true) with check (true);
create policy "demo read batch runs" on public.vyron_cost_batch_runs for select using (true);
create policy "demo write batch runs" on public.vyron_cost_batch_runs for all using (true) with check (true);

insert into public.vyron_cost_recipe_items (
  company_id, recipe_id, ingredient_id, ingredient_name_snapshot, quantity, unit, true_unit_cost
)
with seed_recipe_items(recipe_name, ingredient_name, quantity, unit) as (
  values
  ('Salmon Poke Mix','Rice',0.180,'kg cooked'),
  ('Salmon Poke Mix','Avocado',0.080,'kg usable'),
  ('Salmon Poke Mix','Chicken Fillet',0.000,'kg cooked'),
  ('California Roll Base','Rice',0.120,'kg cooked'),
  ('California Roll Base','Avocado',0.060,'kg usable'),
  ('Spicy Mayo','Mayonnaise',1.000,'litre')
)
select c.id, r.id, i.id, i.ingredient_name, ri.quantity, ri.unit, i.true_unit_cost
from public.vyron_cost_companies c
inner join seed_recipe_items ri on true
inner join public.vyron_cost_recipes r
  on r.company_id = c.id and r.recipe_name = ri.recipe_name
inner join public.vyron_cost_ingredients i
  on i.company_id = c.id and i.ingredient_name = ri.ingredient_name
where c.name = 'Demo Company'
and not exists (
  select 1 from public.vyron_cost_recipe_items x
  where x.recipe_id = r.id and x.ingredient_name_snapshot = i.ingredient_name
);

insert into public.vyron_cost_product_recipe_links (
  company_id, product_id, recipe_id, recipe_name_snapshot, portion_qty, portion_cost
)
with seed_product_recipe_links(product_name, recipe_name, portion_qty) as (
  values
  ('Salmon Poke Bowl','Salmon Poke Mix',1.000),
  ('California Roll','California Roll Base',1.000),
  ('Chicken Mayo Bowl','Chicken Mayo Filling',0.350),
  ('Avo Crunch Roll','California Roll Base',1.000)
)
select c.id, p.id, r.id, r.recipe_name, pr.portion_qty, r.total_cost * pr.portion_qty
from public.vyron_cost_companies c
inner join seed_product_recipe_links pr on true
inner join public.vyron_cost_products p
  on p.company_id = c.id and p.product_name = pr.product_name
inner join public.vyron_cost_recipes r
  on r.company_id = c.id and r.recipe_name = pr.recipe_name
where c.name = 'Demo Company'
and not exists (
  select 1 from public.vyron_cost_product_recipe_links x
  where x.product_id = p.id and x.recipe_id = r.id
);

insert into public.vyron_cost_batch_runs (
  company_id, recipe_id, batch_number, recipe_name_snapshot,
  planned_yield, actual_yield, planned_cost, actual_cost, status
)
with seed_batch_runs(
  batch_number, recipe_name, planned_yield, actual_yield, planned_cost, actual_cost, status
) as (
  values
  ('BATCH-1001','Salmon Poke Mix',50.000,47.000,3210.00,3480.00,'Variance'),
  ('BATCH-1002','California Roll Base',80.000,82.000,1473.60,1460.00,'Complete'),
  ('BATCH-1003','Chicken Mayo Filling',30.000,28.500,2904.00,3010.00,'Review')
)
select c.id, r.id, b.batch_number, r.recipe_name,
  b.planned_yield, b.actual_yield, b.planned_cost, b.actual_cost, b.status
from public.vyron_cost_companies c
inner join seed_batch_runs b on true
inner join public.vyron_cost_recipes r
  on r.company_id = c.id and r.recipe_name = b.recipe_name
where c.name = 'Demo Company'
and not exists (
  select 1 from public.vyron_cost_batch_runs x
  where x.batch_number = b.batch_number
);
