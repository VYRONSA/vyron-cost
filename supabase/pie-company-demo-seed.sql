-- VYRON PIE CO — OPTIONAL SUPABASE SEED
-- Run after stage2-vyron-cost-leakage-intelligence.sql
-- Or use in-app demo mode without SQL (NEXT_PUBLIC_VYRON_PIE_DEMO=true)

insert into public.vyron_cost_companies (name, trading_name, subscription_plan, subscription_status)
values ('Vyron Pie Co', 'Vyron Pie Manufacturing', 'Enterprise', 'Active')
on conflict do nothing;

-- Demo intelligence rows align with src/lib/vyron-pie-demo.ts when company exists.
