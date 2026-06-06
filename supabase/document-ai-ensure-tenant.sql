-- VYRON COST — Ensure document upload tenant exists
-- Run this if uploads fail with "Unknown tenant_id".
-- Safe to re-run.

insert into public.vyron_cost_companies (id, name)
values ('48002864-8800-4000-9000-000000000001', 'Handcrafted Food Products')
on conflict (id) do update set name = excluded.name;

-- If you only have "Demo Company" from days7-10, this still works — uploads will
-- auto-resolve to Demo Company when Handcrafted id is missing (app logic).
