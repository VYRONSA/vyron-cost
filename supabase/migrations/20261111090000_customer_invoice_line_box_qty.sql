-- Customer invoice lines: user-entered Box Qty.
--
-- ADDITIVE ONLY. One nullable column and one check constraint on
-- public.vyron_customer_invoice_lines. No default, no backfill, no existing row is changed:
-- every existing line keeps box_qty NULL and its invoice shows "-" in the Box Qty column.
--
-- box_qty is display information typed by the user on the invoice line. It is never derived
-- from quantity or a pack size, and it feeds none of the generated columns (line_total,
-- line_cost, line_gp) nor any tax, total or stock figure.
--
-- Rollback (only if no Box Qty has been entered that must be kept):
--   alter table public.vyron_customer_invoice_lines
--     drop constraint if exists vyron_invoice_lines_box_qty_check,
--     drop column if exists box_qty;

alter table public.vyron_customer_invoice_lines
  add column if not exists box_qty numeric(18,4) null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vyron_invoice_lines_box_qty_check'
      and conrelid = 'public.vyron_customer_invoice_lines'::regclass
  ) then
    alter table public.vyron_customer_invoice_lines
      add constraint vyron_invoice_lines_box_qty_check check (box_qty is null or box_qty >= 0);
  end if;
end $$;

comment on column public.vyron_customer_invoice_lines.box_qty is
  'Boxes on the line as entered by the user (display only, Box Qty on the tax invoice). NULL = not given. Never derived from quantity.';

notify pgrst, 'reload schema';
