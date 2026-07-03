-- Ensure vyron_cost_products has updated_at for product save/edit/archive workflows.
-- Idempotent hotfix for environments created from partial legacy schema scripts.

alter table if exists public.vyron_cost_products
  add column if not exists updated_at timestamptz not null default now();

-- Keep existing rows consistent where nulls may have slipped through historical imports.
update public.vyron_cost_products
set updated_at = coalesce(updated_at, now())
where updated_at is null;

-- Add trigger-backed maintenance if shared function is present or create it if absent.
create or replace function public.vyron_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_vyron_cost_products_updated_at on public.vyron_cost_products;
create trigger trg_vyron_cost_products_updated_at
before update on public.vyron_cost_products
for each row execute function public.vyron_set_updated_at();
