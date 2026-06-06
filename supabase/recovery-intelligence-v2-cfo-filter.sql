-- VYRON COST — Recovery Intelligence V2 CFO Filter support
-- Run after: supabase/recovery-intelligence-v2.sql

alter table public.vyron_recovery_calculations
  add column if not exists missing_inputs jsonb not null default '[]'::jsonb;
