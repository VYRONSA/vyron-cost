-- Align product commercial GP fields used by import and master-data flows.
alter table if exists public.vyron_cost_products
  add column if not exists total_cost numeric(14,4) default 0,
  add column if not exists target_gp numeric(8,2) default 40,
  add column if not exists calculated_gp numeric(8,2),
  add column if not exists actual_gp numeric(8,2);

update public.vyron_cost_products
set calculated_gp = coalesce(
  calculated_gp,
  round(
    case
      when coalesce(selling_price, 0) > 0 then ((coalesce(selling_price, 0) - coalesce(total_cost, 0)) / selling_price) * 100
      else 0
    end
  , 2)
)
where calculated_gp is null;

update public.vyron_cost_products
set actual_gp = coalesce(actual_gp, calculated_gp)
where actual_gp is null;

alter table if exists public.vyron_cost_products
  alter column actual_gp set default 0,
  alter column calculated_gp set default 0;