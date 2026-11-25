-- Controlled, sequential document numbering (customer invoices, production job cards).
--
-- WHY
-- Customer invoice numbers were SI-<last 8 digits of a millisecond timestamp>, assigned when the DRAFT
-- was created, unique only globally, never sequential, and lost when a draft was deleted. SA VAT
-- practice requires every issued tax invoice to carry a unique, traceable number that is never reused.
--
-- WHAT THIS ADDS (additive; no existing invoice number, row or export is changed)
-- 1. vyron_document_sequences: one counter row per (company, series). The counter row is locked by an
--    UPDATE ... RETURNING inside a single function call, so concurrent callers are serialised and can
--    never receive the same value. No MAX()+1, no count()+1.
-- 2. vyron_document_number_register: an append-only record of every number issued (who, when, which
--    document). Unique per (company, series, value) and (company, series, number).
-- 3. vyron_issue_customer_invoice_number(): locks the invoice row, and only for a Draft carrying a
--    provisional DRAFT- reference takes the next number, stamps it on the invoice and registers it —
--    one transaction. Calling it again for an invoice that already has an issued number returns that
--    number (idempotent), so a retry can never consume a second number. Legacy SI-, imported and
--    online-store (WC-/SHP-) numbers are never renumbered.
-- 4. vyron_next_document_number(): the same counter for non-financial series (job cards).
-- 5. Invoice numbers become unique PER COMPANY (company_id, invoice_number) instead of globally — a
--    per-company series needs it. The old global unique is strictly stronger, so every existing row
--    already satisfies the new index; the global constraint is dropped only after the per-company
--    index exists. The stock-posted-once partial index is re-created per company the same way.
--
-- SECURITY: RLS on, no policies; functions are SECURITY INVOKER and executable by service_role only.
--
-- ROLLBACK (only if no INV- sequential number has been issued yet):
--   drop function if exists public.vyron_issue_customer_invoice_number(uuid, uuid, text);
--   drop function if exists public.vyron_next_document_number(uuid, text, text, integer, text, uuid, text);
--   drop table if exists public.vyron_document_number_register;
--   drop table if exists public.vyron_document_sequences;
--   alter table public.vyron_customer_invoices drop column if exists number_issued_at,
--     drop column if exists number_issued_by, drop column if exists draft_reference;
--   (the per-company unique index may stay; restoring the global unique is only possible while no two
--    companies share a number)

create table if not exists public.vyron_document_sequences (
  company_id uuid not null,
  series_key text not null,
  prefix text not null,
  padding integer not null default 6,
  next_value bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text null,
  primary key (company_id, series_key),
  constraint vyron_document_sequences_padding check (padding between 3 and 12),
  constraint vyron_document_sequences_next check (next_value >= 1),
  constraint vyron_document_sequences_prefix check (char_length(prefix) between 1 and 20 and prefix !~ '\s')
);

create table if not exists public.vyron_document_number_register (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  series_key text not null,
  sequence_value bigint not null,
  document_number text not null,
  document_type text not null,
  document_id uuid null,
  disposition text not null default 'ISSUED',
  issued_by text not null,
  issued_at timestamptz not null default now(),
  note text null,
  constraint vyron_document_number_register_disposition check (disposition in ('ISSUED', 'SKIPPED_IN_USE')),
  constraint uq_vyron_document_number_register_value unique (company_id, series_key, sequence_value),
  constraint uq_vyron_document_number_register_number unique (company_id, series_key, document_number)
);
create index if not exists idx_vyron_document_number_register_doc
  on public.vyron_document_number_register (company_id, document_type, document_id);

alter table public.vyron_document_sequences enable row level security;
alter table public.vyron_document_number_register enable row level security;
revoke all on public.vyron_document_sequences from anon, authenticated;
grant select, insert, update, delete on public.vyron_document_sequences to service_role;
revoke all on public.vyron_document_number_register from anon, authenticated;
grant select, insert, update, delete on public.vyron_document_number_register to service_role;

-- Invoice columns recording the issue (nullable, additive).
alter table public.vyron_customer_invoices add column if not exists number_issued_at timestamptz null;
alter table public.vyron_customer_invoices add column if not exists number_issued_by text null;
alter table public.vyron_customer_invoices add column if not exists draft_reference text null;

-- Per-company uniqueness first, then drop any single-column global unique on invoice_number.
create unique index if not exists uq_vyron_customer_invoices_company_number
  on public.vyron_customer_invoices (company_id, invoice_number);

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'vyron_customer_invoices' and c.contype = 'u'
      and array_length(c.conkey, 1) = 1
      and c.conkey[1] = (select attnum from pg_attribute where attrelid = t.oid and attname = 'invoice_number')
  loop
    execute format('alter table public.vyron_customer_invoices drop constraint %I', r.conname);
  end loop;
end $$;

create unique index if not exists idx_vyron_customer_invoices_company_stock_posted_once
  on public.vyron_customer_invoices (company_id, invoice_number) where stock_posted = true;
drop index if exists public.idx_vyron_customer_invoices_stock_posted_once;

-- Generic counter: next number for a series (job cards and other non-financial documents).
create or replace function public.vyron_next_document_number(
  p_company_id uuid,
  p_series_key text,
  p_default_prefix text,
  p_default_padding integer,
  p_document_type text,
  p_document_id uuid,
  p_actor text
) returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_value bigint;
  v_prefix text;
  v_padding integer;
  v_number text;
begin
  if p_company_id is null or coalesce(btrim(p_series_key), '') = '' then
    raise exception 'company and series are required';
  end if;
  insert into vyron_document_sequences (company_id, series_key, prefix, padding)
  values (p_company_id, p_series_key, p_default_prefix, coalesce(p_default_padding, 6))
  on conflict (company_id, series_key) do nothing;

  update vyron_document_sequences
     set next_value = next_value + 1, updated_at = now()
   where company_id = p_company_id and series_key = p_series_key
  returning next_value - 1, prefix, padding into v_value, v_prefix, v_padding;

  v_number := v_prefix || lpad(v_value::text, v_padding, '0');
  insert into vyron_document_number_register
    (company_id, series_key, sequence_value, document_number, document_type, document_id, issued_by)
  values (p_company_id, p_series_key, v_value, v_number, p_document_type, p_document_id, coalesce(p_actor, 'system'));
  return v_number;
end;
$$;

-- Customer invoice: issue the official number for one draft, atomically and exactly once.
create or replace function public.vyron_issue_customer_invoice_number(
  p_company_id uuid,
  p_invoice_id uuid,
  p_actor text
) returns table (invoice_number text, newly_issued boolean)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_inv record;
  v_value bigint;
  v_prefix text;
  v_padding integer;
  v_number text;
begin
  select i.id, i.invoice_number, i.status, i.number_issued_at
    into v_inv
    from vyron_customer_invoices i
   where i.id = p_invoice_id and i.company_id = p_company_id
   for update;
  if not found then
    raise exception 'INVOICE_NOT_FOUND';
  end if;

  -- Already issued (a retry, or a concurrent caller that won the lock): same number, nothing consumed.
  if v_inv.number_issued_at is not null then
    return query select v_inv.invoice_number::text, false;
    return;
  end if;
  -- Legacy / imported / online-store numbers are kept as they are.
  if v_inv.invoice_number is null or v_inv.invoice_number !~ '^DRAFT-' then
    return query select v_inv.invoice_number::text, false;
    return;
  end if;
  if v_inv.status <> 'Draft' then
    raise exception 'INVOICE_NOT_DRAFT';
  end if;

  insert into vyron_document_sequences (company_id, series_key, prefix, padding)
  values (p_company_id, 'customer_invoice', 'INV-', 6)
  on conflict (company_id, series_key) do nothing;

  loop
    update vyron_document_sequences
       set next_value = next_value + 1, updated_at = now()
     where company_id = p_company_id and series_key = 'customer_invoice'
    returning next_value - 1, prefix, padding into v_value, v_prefix, v_padding;
    v_number := v_prefix || lpad(v_value::text, v_padding, '0');
    -- Never hand out a number another invoice of this company already carries (e.g. imported history).
    exit when not exists (
      select 1 from vyron_customer_invoices x where x.company_id = p_company_id and x.invoice_number = v_number
    );
    insert into vyron_document_number_register
      (company_id, series_key, sequence_value, document_number, document_type, document_id, disposition, issued_by, note)
    values (p_company_id, 'customer_invoice', v_value, v_number, 'customer_invoice', null, 'SKIPPED_IN_USE',
            coalesce(p_actor, 'system'), 'Number already carried by an existing invoice of this company; skipped.');
  end loop;

  update vyron_customer_invoices
     set draft_reference = invoice_number,
         invoice_number = v_number,
         number_issued_at = now(),
         number_issued_by = coalesce(p_actor, 'system'),
         updated_at = now()
   where id = p_invoice_id and company_id = p_company_id;

  insert into vyron_document_number_register
    (company_id, series_key, sequence_value, document_number, document_type, document_id, issued_by)
  values (p_company_id, 'customer_invoice', v_value, v_number, 'customer_invoice', p_invoice_id, coalesce(p_actor, 'system'));

  return query select v_number, true;
end;
$$;

-- Configure a series' prefix / starting number. Refused once ANY number has been issued in it, under the
-- same row lock the issuing functions take, so an issued sequence can never be rewound or re-prefixed.
create or replace function public.vyron_configure_document_series(
  p_company_id uuid,
  p_series_key text,
  p_prefix text,
  p_padding integer,
  p_start_at bigint,
  p_actor text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into vyron_document_sequences (company_id, series_key, prefix, padding)
  values (p_company_id, p_series_key, p_prefix, p_padding)
  on conflict (company_id, series_key) do nothing;
  perform 1 from vyron_document_sequences
   where company_id = p_company_id and series_key = p_series_key for update;
  if exists (select 1 from vyron_document_number_register
              where company_id = p_company_id and series_key = p_series_key) then
    raise exception 'SERIES_ALREADY_USED';
  end if;
  update vyron_document_sequences
     set prefix = p_prefix, padding = p_padding, next_value = p_start_at, updated_at = now(), updated_by = p_actor
   where company_id = p_company_id and series_key = p_series_key;
end;
$$;
revoke all on function public.vyron_configure_document_series(uuid, text, text, integer, bigint, text) from public, anon, authenticated;
grant execute on function public.vyron_configure_document_series(uuid, text, text, integer, bigint, text) to service_role;

revoke all on function public.vyron_next_document_number(uuid, text, text, integer, text, uuid, text) from public, anon, authenticated;
revoke all on function public.vyron_issue_customer_invoice_number(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.vyron_next_document_number(uuid, text, text, integer, text, uuid, text) to service_role;
grant execute on function public.vyron_issue_customer_invoice_number(uuid, uuid, text) to service_role;
