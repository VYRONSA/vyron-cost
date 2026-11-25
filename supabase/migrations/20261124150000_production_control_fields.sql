-- Production control data capture on MFG production runs.
--
-- WHY
-- The Daily Production Control Report needs a schedule (planned date, required completion date,
-- priority, area, responsible person), quality (rejected / rework quantities) and downtime. None of
-- these exist on vyron_cost_production_runs today, so the report shows them as "Not captured". These
-- nullable columns let production capture them from the run's Production Control panel; nothing is
-- back-filled or estimated.
--
-- BASELINE. planned_qty is the issued plan and is never edited (completion writes actual_qty). The
-- first planned_date a run receives is also kept in original_planned_date, so re-scheduling a run never
-- overwrites the original issued schedule the report compares against.
--
-- Additive only: nullable columns and checks; no existing row or value changes.
--
-- ROLLBACK:
--   alter table public.vyron_cost_production_runs
--     drop column if exists planned_date, drop column if exists original_planned_date,
--     drop column if exists due_date, drop column if exists priority, drop column if exists production_area,
--     drop column if exists responsible_person, drop column if exists on_hold, drop column if exists on_hold_reason,
--     drop column if exists rejected_qty, drop column if exists rework_qty,
--     drop column if exists downtime_minutes, drop column if exists downtime_reason;

alter table public.vyron_cost_production_runs
  add column if not exists planned_date date null,
  add column if not exists original_planned_date date null,
  add column if not exists due_date date null,
  add column if not exists priority text null,
  add column if not exists production_area text null,
  add column if not exists responsible_person text null,
  add column if not exists on_hold boolean not null default false,
  add column if not exists on_hold_reason text null,
  add column if not exists rejected_qty numeric(18,4) null,
  add column if not exists rework_qty numeric(18,4) null,
  add column if not exists downtime_minutes numeric(10,2) null,
  add column if not exists downtime_reason text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vyron_cost_production_runs_priority_check') then
    alter table public.vyron_cost_production_runs
      add constraint vyron_cost_production_runs_priority_check
      check (priority is null or priority in ('Low', 'Normal', 'High', 'Urgent'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vyron_cost_production_runs_quality_check') then
    alter table public.vyron_cost_production_runs
      add constraint vyron_cost_production_runs_quality_check
      check ((rejected_qty is null or rejected_qty >= 0) and (rework_qty is null or rework_qty >= 0)
             and (downtime_minutes is null or downtime_minutes >= 0));
  end if;
end $$;

create index if not exists idx_vyron_cost_production_runs_planned_date
  on public.vyron_cost_production_runs (company_id, planned_date);
