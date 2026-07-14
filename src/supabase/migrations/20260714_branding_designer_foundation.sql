-- VYRON Branding Designer: complete the company branding data model so every field the
-- Branding Designer exposes can actually persist (colour palette, logo placement/size,
-- footer/terms/authorisation defaults). BrandingRepository already reads/writes the
-- palette column names below (see mapBranding/updateByWorkspaceId) — they were simply
-- missing from the table, so this migration closes that gap the same way the prior
-- branding-foundation migration did for logo_url/website/vat_number/etc.

begin;

alter table if exists public.vyron_cost_companies
  add column if not exists primary_color text,
  add column if not exists secondary_color text,
  add column if not exists accent_color text,
  add column if not exists dark_text_color text,
  add column if not exists light_text_color text,
  add column if not exists header_background_color text,
  add column if not exists footer_background_color text,
  add column if not exists logo_position text default 'top_left',
  add column if not exists logo_position_x numeric(6,2),
  add column if not exists logo_position_y numeric(6,2),
  add column if not exists logo_size_preset text default 'medium',
  add column if not exists logo_width numeric(6,2),
  add column if not exists logo_height numeric(6,2),
  add column if not exists logo_maintain_aspect_ratio boolean not null default true,
  add column if not exists footer_text text,
  add column if not exists terms_and_conditions text,
  add column if not exists authorisation_footer_text text;

commit;
