-- VYRON COST — DOCUMENT AI V2 (PHASE 1B)
-- Fix missing columns in vyron_documents expected by code.
-- Safe to run multiple times.

alter table if exists public.vyron_documents
  add column if not exists account_number text;

alter table if exists public.vyron_documents
  add column if not exists customer_reference text;

alter table if exists public.vyron_documents
  add column if not exists sales_representative text;
