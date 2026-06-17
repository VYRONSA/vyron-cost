-- VYRON CORE Phase 6 — Workforce Digital Twin Foundation

create table if not exists public.workforce_digital_twin (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  employee_id text not null,
  employee_name text not null,
  department text not null,
  role text not null,
  shift_pattern jsonb not null default '{}'::jsonb,
  clock_in_rate numeric not null default 0,
  productivity_index numeric not null default 0,
  travel_km_month numeric not null default 0,
  field_visits_month int not null default 0,
  cost_per_hour numeric not null default 0,
  risk_score numeric not null default 0,
  health_score numeric not null default 0,
  attrition_probability numeric not null default 0,
  twin_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workforce_forecasts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  forecast_type text not null check (forecast_type in ('labour_cost', 'productivity', 'attrition', 'leakage', 'workforce_health')),
  period_label text not null,
  forecast_value numeric not null default 0,
  confidence numeric not null default 0,
  model_version text not null default 'v1',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.workforce_simulations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  scenario_name text not null,
  scenario_type text not null check (scenario_type in ('headcount', 'overtime', 'attrition', 'field_coverage', 'travel_reduction')),
  input_params jsonb not null default '{}'::jsonb,
  output_results jsonb not null default '{}'::jsonb,
  status text not null default 'completed' check (status in ('pending', 'running', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.workforce_health_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null,
  department text not null,
  score numeric not null default 0,
  labour_cost_score numeric not null default 0,
  productivity_score numeric not null default 0,
  clocking_score numeric not null default 0,
  field_ops_score numeric not null default 0,
  travel_score numeric not null default 0,
  risk_score numeric not null default 0,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_workforce_digital_twin_company on public.workforce_digital_twin(company_id);
create index if not exists idx_workforce_digital_twin_department on public.workforce_digital_twin(department);
create index if not exists idx_workforce_forecasts_type on public.workforce_forecasts(forecast_type);
create index if not exists idx_workforce_simulations_type on public.workforce_simulations(scenario_type);
create index if not exists idx_workforce_health_scores_department on public.workforce_health_scores(department);
create index if not exists idx_workforce_health_scores_recorded on public.workforce_health_scores(recorded_at desc);
