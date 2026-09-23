-- Customer price lists: what happens when the customer's own list does not
-- cover a product.
--
-- NOT APPLIED to production. Additive only: one nullable column with a default
-- that preserves today's behaviour exactly.
--
-- Until now, a customer whose price list did not carry a product was quoted the
-- product master price, and could order at it. For a business whose price lists
-- are meant to be exhaustive that is wrong: the customer sees a price nobody
-- agreed with them. For a business that lists only its discounted lines it is
-- right. It is therefore a decision per customer, not a rule in the code.
--
--   fallback_to_master  the master price is used when the list has no item
--                       (what every existing customer does today)
--   assigned_list_only  only the assigned price list may price this customer;
--                       a product it does not cover is shown as unavailable
--                       and cannot be ordered
--
-- Rollback:
--   alter table public.vyron_customer_price_list_assignments
--     drop column if exists price_source_rule;

alter table public.vyron_customer_price_list_assignments
  add column if not exists price_source_rule text not null default 'fallback_to_master';

alter table public.vyron_customer_price_list_assignments
  drop constraint if exists vyron_customer_price_list_assignments_price_source_rule;
alter table public.vyron_customer_price_list_assignments
  add constraint vyron_customer_price_list_assignments_price_source_rule
  check (price_source_rule in ('fallback_to_master', 'assigned_list_only'));

comment on column public.vyron_customer_price_list_assignments.price_source_rule is
  'assigned_list_only: only this customer''s assigned price list may price them; a product the list does not cover is unavailable to them. fallback_to_master: the product master price is used instead (the historical behaviour).';
