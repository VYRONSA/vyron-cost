-- Sprint 4B: Purchase order engine extensions (requisition linkage + expected dates)

alter table if exists public.vyron_cost_purchase_orders
  add column if not exists expected_date date,
  add column if not exists procurement_requisition_id uuid,
  add column if not exists created_by text;

create index if not exists vyron_cost_purchase_orders_company_requisition_idx
  on public.vyron_cost_purchase_orders (company_id, procurement_requisition_id);

-- ingredient lines: item_id already stores ingredient_id for item_type = ingredient
