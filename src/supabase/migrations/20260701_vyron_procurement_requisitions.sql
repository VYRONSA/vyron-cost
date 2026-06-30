-- Sprint 4A: Procurement requisitions from shortages and planning demand

create table if not exists public.vyron_cost_procurement_requisitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  requisition_number text not null,
  status text not null default 'Draft',
  required_date date null,
  notes text null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vyron_cost_procurement_requisitions_company_number_uidx
  on public.vyron_cost_procurement_requisitions (company_id, requisition_number);

create index if not exists vyron_cost_procurement_requisitions_company_status_idx
  on public.vyron_cost_procurement_requisitions (company_id, status);

create table if not exists public.vyron_cost_procurement_requisition_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  requisition_id uuid not null references public.vyron_cost_procurement_requisitions (id) on delete cascade,
  ingredient_id uuid null,
  ingredient_name text not null,
  required_qty numeric(14, 4) not null default 0,
  available_qty numeric(14, 4) not null default 0,
  shortage_qty numeric(14, 4) not null default 0,
  unit text not null default 'kg',
  estimated_cost numeric(14, 2) not null default 0,
  preferred_supplier_id uuid null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists vyron_cost_procurement_requisition_lines_req_idx
  on public.vyron_cost_procurement_requisition_lines (requisition_id);

create index if not exists vyron_cost_procurement_requisition_lines_company_idx
  on public.vyron_cost_procurement_requisition_lines (company_id);
