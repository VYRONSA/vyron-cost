alter table if exists public.vyron_company_financial_settings
  drop constraint if exists vyron_company_financial_settings_company_id_key;

create unique index if not exists vyron_company_financial_settings_scope_unique
  on public.vyron_company_financial_settings (workspace_id, company_id, integration_type);
