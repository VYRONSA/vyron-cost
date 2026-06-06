-- Optional: allow anon/demo clients to READ companies (Table Editor uses service role and is unaffected).
-- Document upload API still requires SUPABASE_SERVICE_ROLE_KEY.

alter table public.vyron_cost_companies enable row level security;

drop policy if exists "demo read vyron_cost_companies" on public.vyron_cost_companies;
drop policy if exists "demo write vyron_cost_companies" on public.vyron_cost_companies;

create policy "demo read vyron_cost_companies"
  on public.vyron_cost_companies for select using (true);

create policy "demo write vyron_cost_companies"
  on public.vyron_cost_companies for all using (true) with check (true);
