-- Sprint 5A: Demand forecasting from store order behaviour

create table if not exists public.vyron_cost_demand_forecasts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  forecast_date date not null default current_date,
  product_id uuid null,
  product_name text not null,
  period_type text not null,
  forecast_qty numeric(14, 4) not null default 0,
  confidence_level numeric(5, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists vyron_cost_demand_forecasts_company_date_idx
  on public.vyron_cost_demand_forecasts (company_id, forecast_date desc);

create index if not exists vyron_cost_demand_forecasts_company_product_idx
  on public.vyron_cost_demand_forecasts (company_id, product_id, period_type);
