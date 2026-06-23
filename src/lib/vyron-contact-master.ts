import type { SupabaseClient } from "@supabase/supabase-js";

export type VyronContact = {
  id: string;
  company_id: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  xero_contact_id: string | null;
  is_customer: boolean;
  is_supplier: boolean;
  created_at: string;
  updated_at: string;
};

export type ContactFilter = "all" | "customer" | "supplier" | "both";

export type ContactMigrationResult = {
  imported: number;
  merged: number;
  skipped: number;
  total: number;
};

export type ContactMasterMigrationSummary = {
  customers: ContactMigrationResult;
  suppliers: ContactMigrationResult;
};

type ContactUpsertInput = {
  contact_name: string;
  email?: string | null;
  phone?: string | null;
  xero_contact_id?: string | null;
  is_customer?: boolean;
  is_supplier?: boolean;
};

export async function listVyronContacts(
  supabase: SupabaseClient,
  companyId: string,
  filter: ContactFilter = "all"
): Promise<VyronContact[]> {
  let query = supabase
    .from("vyron_contacts")
    .select("*")
    .eq("company_id", companyId)
    .order("contact_name", { ascending: true });

  if (filter === "customer") {
    query = query.eq("is_customer", true).eq("is_supplier", false);
  } else if (filter === "supplier") {
    query = query.eq("is_supplier", true).eq("is_customer", false);
  } else if (filter === "both") {
    query = query.eq("is_customer", true).eq("is_supplier", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as VyronContact[];
}

export async function upsertVyronContact(
  supabase: SupabaseClient,
  companyId: string,
  input: ContactUpsertInput
): Promise<"imported" | "merged"> {
  const now = new Date().toISOString();
  const contactName = input.contact_name.trim();
  const xeroContactId = input.xero_contact_id?.trim() || null;

  if (!contactName) {
    throw new Error("contact_name is required.");
  }

  if (xeroContactId) {
    const { data: existing, error: existingError } = await supabase
      .from("vyron_contacts")
      .select("*")
      .eq("company_id", companyId)
      .eq("xero_contact_id", xeroContactId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    if (existing) {
      const { error } = await supabase
        .from("vyron_contacts")
        .update({
          contact_name: contactName || existing.contact_name,
          email: input.email ?? existing.email,
          phone: input.phone ?? existing.phone,
          is_customer: Boolean(existing.is_customer || input.is_customer),
          is_supplier: Boolean(existing.is_supplier || input.is_supplier),
          updated_at: now,
        })
        .eq("id", existing.id);

      if (error) throw new Error(error.message);
      return "merged";
    }
  }

  const { error: insertError } = await supabase.from("vyron_contacts").insert({
    company_id: companyId,
    contact_name: contactName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    xero_contact_id: xeroContactId,
    is_customer: Boolean(input.is_customer),
    is_supplier: Boolean(input.is_supplier),
    created_at: now,
    updated_at: now,
  });

  if (insertError) throw new Error(insertError.message);
  return "imported";
}

export async function migrateCustomersToVyronContacts(
  supabase: SupabaseClient,
  companyId: string
): Promise<ContactMigrationResult> {
  const { data: customers, error } = await supabase
    .from("vyron_customers")
    .select("customer_name, email, phone, xero_contact_id")
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  let imported = 0;
  let merged = 0;
  let skipped = 0;

  for (const customer of customers || []) {
    const contactName = String(customer.customer_name || "").trim();
    if (!contactName) {
      skipped += 1;
      continue;
    }

    const result = await upsertVyronContact(supabase, companyId, {
      contact_name: contactName,
      email: customer.email,
      phone: customer.phone,
      xero_contact_id: customer.xero_contact_id,
      is_customer: true,
    });

    if (result === "merged") merged += 1;
    else imported += 1;
  }

  return {
    imported,
    merged,
    skipped,
    total: (customers || []).length,
  };
}

export async function migrateSuppliersToVyronContacts(
  supabase: SupabaseClient,
  companyId: string
): Promise<ContactMigrationResult> {
  const { data: suppliers, error } = await supabase
    .from("vyron_cost_suppliers")
    .select("supplier_name, contact_email, phone, xero_contact_id")
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  let imported = 0;
  let merged = 0;
  let skipped = 0;

  for (const supplier of suppliers || []) {
    const contactName = String(supplier.supplier_name || "").trim();
    if (!contactName) {
      skipped += 1;
      continue;
    }

    const result = await upsertVyronContact(supabase, companyId, {
      contact_name: contactName,
      email: supplier.contact_email,
      phone: supplier.phone,
      xero_contact_id: supplier.xero_contact_id,
      is_supplier: true,
    });

    if (result === "merged") merged += 1;
    else imported += 1;
  }

  return {
    imported,
    merged,
    skipped,
    total: (suppliers || []).length,
  };
}

export async function migrateExistingContactsToMaster(
  supabase: SupabaseClient,
  companyId: string
): Promise<ContactMasterMigrationSummary> {
  const customers = await migrateCustomersToVyronContacts(supabase, companyId);
  const suppliers = await migrateSuppliersToVyronContacts(supabase, companyId);
  return { customers, suppliers };
}
