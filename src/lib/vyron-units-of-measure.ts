import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type UnitOfMeasureRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  symbol: string | null;
  category: string;
  decimal_precision: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type UnitOfMeasureInput = {
  code: string;
  name: string;
  symbol?: string | null;
  category?: string | null;
  decimal_precision?: number | null;
  is_active?: boolean;
  notes?: string | null;
};

function normalizeCode(code: string) {
  return String(code || "").trim().toUpperCase();
}

function normalizeName(name: string) {
  return String(name || "").trim();
}

function normalizePrecision(value: number | null | undefined) {
  const precision = Number.isFinite(Number(value)) ? Number(value) : 2;
  if (precision < 0 || precision > 6) {
    throw new Error("decimal_precision must be between 0 and 6.");
  }
  return Math.round(precision);
}

function normalizePayload(input: UnitOfMeasureInput) {
  const code = normalizeCode(input.code);
  const name = normalizeName(input.name);
  if (!code) throw new Error("Unit code is required.");
  if (!name) throw new Error("Unit name is required.");

  return {
    code,
    name,
    symbol: input.symbol ? String(input.symbol).trim() : null,
    category: String(input.category || "General").trim() || "General",
    decimal_precision: normalizePrecision(input.decimal_precision),
    is_active: input.is_active !== false,
    notes: input.notes ? String(input.notes).trim() : null,
  };
}

async function ensureUniqueCode(
  supabase: SupabaseClient,
  companyId: string,
  code: string,
  excludeId?: string
) {
  let query = supabase
    .from("vyron_cost_units_of_measure")
    .select("id,code")
    .eq("company_id", companyId)
    .ilike("code", code)
    .limit(1);

  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.id) throw new Error(`Unit code ${code} already exists.`);
}

export async function listUnitsOfMeasure(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_units_of_measure")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as UnitOfMeasureRow[];
}

export async function getUnitOfMeasureById(
  supabase: SupabaseClient,
  companyId: string,
  id: string
) {
  const { data, error } = await supabase
    .from("vyron_cost_units_of_measure")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UnitOfMeasureRow | null) || null;
}

export async function createUnitOfMeasure(
  supabase: SupabaseClient,
  companyId: string,
  input: UnitOfMeasureInput
) {
  const payload = normalizePayload(input);
  await ensureUniqueCode(supabase, companyId, payload.code);

  const { data, error } = await supabase
    .from("vyron_cost_units_of_measure")
    .insert({
      id: randomUUID(),
      company_id: companyId,
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as UnitOfMeasureRow;
}

export async function updateUnitOfMeasure(
  supabase: SupabaseClient,
  companyId: string,
  id: string,
  input: Partial<UnitOfMeasureInput>
) {
  const current = await getUnitOfMeasureById(supabase, companyId, id);
  if (!current) throw new Error("Unit of measure not found.");

  const merged = normalizePayload({
    code: input.code ?? current.code,
    name: input.name ?? current.name,
    symbol: input.symbol ?? current.symbol,
    category: input.category ?? current.category,
    decimal_precision: input.decimal_precision ?? current.decimal_precision,
    is_active: input.is_active ?? current.is_active,
    notes: input.notes ?? current.notes,
  });

  await ensureUniqueCode(supabase, companyId, merged.code, id);

  const { data, error } = await supabase
    .from("vyron_cost_units_of_measure")
    .update({ ...merged, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as UnitOfMeasureRow;
}

export async function deleteUnitOfMeasure(supabase: SupabaseClient, companyId: string, id: string) {
  const { error } = await supabase
    .from("vyron_cost_units_of_measure")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
