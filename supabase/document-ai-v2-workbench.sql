-- Invoice Review Workbench: reconciliation note on approve/save mismatch acceptance
alter table public.vyron_documents
  add column if not exists reconciliation_note text;

comment on column public.vyron_documents.reconciliation_note is
  'User reason when extracted invoice totals differ from summed line totals at approval.';
