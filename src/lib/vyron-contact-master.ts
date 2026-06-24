import { randomUUID } from "crypto";
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

async function findVyronContactByName(
  supabase: SupabaseClient,
  companyId: string,
  contactName: string
) {
  const { data, error } = await supabase
    .from("vyron_contacts")
    .select("*")
    .eq("company_id", companyId)
    .ilike("contact_name", contactName.trim())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as VyronContact) || null;
}

async function mergeVyronContact(
  supabase: SupabaseClient,
  existing: VyronContact,
  input: ContactUpsertInput,
  now: string
) {
  const contactName = input.contact_name.trim() || existing.contact_name;
  const xeroContactId = input.xero_contact_id?.trim() || existing.xero_contact_id;

  const { error } = await supabase
    .from("vyron_contacts")
    .update({
      contact_name: contactName,
      email: input.email ?? existing.email,
      phone: input.phone ?? existing.phone,
      xero_contact_id: xeroContactId,
      is_customer: Boolean(existing.is_customer || input.is_customer),
      is_supplier: Boolean(existing.is_supplier || input.is_supplier),
      updated_at: now,
    })
    .eq("id", existing.id);

  if (error) throw new Error(error.message);
  return "merged" as const;
}

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
      await mergeVyronContact(supabase, existing as VyronContact, input, now);
      return "merged";
    }

    const existingByName = await findVyronContactByName(supabase, companyId, contactName);
    if (existingByName && !existingByName.xero_contact_id) {
      await mergeVyronContact(
        supabase,
        existingByName,
        { ...input, xero_contact_id: xeroContactId },
        now
      );
      return "merged";
    }
  } else {
    const existingByName = await findVyronContactByName(supabase, companyId, contactName);
    if (existingByName) {
      await mergeVyronContact(supabase, existingByName, input, now);
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

export type ContactStatistics = {
  total: number;
  customers: number;
  suppliers: number;
  both: number;
};

export async function getContactStatistics(
  supabase: SupabaseClient,
  companyId: string
): Promise<ContactStatistics> {
  const { data, error } = await supabase
    .from("vyron_contacts")
    .select("is_customer, is_supplier")
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  let customers = 0;
  let suppliers = 0;
  let both = 0;

  for (const row of data || []) {
    if (row.is_customer && row.is_supplier) both += 1;
    else if (row.is_customer) customers += 1;
    else if (row.is_supplier) suppliers += 1;
  }

  return {
    total: (data || []).length,
    customers,
    suppliers,
    both,
  };
}

export async function getVyronContactById(
  supabase: SupabaseClient,
  companyId: string,
  contactId: string
): Promise<VyronContact | null> {
  const { data, error } = await supabase
    .from("vyron_contacts")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", contactId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as VyronContact) || null;
}

async function ensureCustomerFromContact(
  supabase: SupabaseClient,
  companyId: string,
  contact: VyronContact
) {
  const now = new Date().toISOString();
  const xeroContactId = contact.xero_contact_id?.trim() || null;
  const contactName = contact.contact_name.trim();

  if (xeroContactId) {
    const { data: existing, error: existingError } = await supabase
      .from("vyron_customers")
      .select("*")
      .eq("company_id", companyId)
      .eq("xero_contact_id", xeroContactId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from("vyron_customers")
        .update({
          customer_name: contactName,
          email: contact.email,
          invoice_email: contact.email,
          phone: contact.phone,
          updated_at: now,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateError) throw new Error(updateError.message);
      return updated;
    }
  }

  const { data: existingByName, error: byNameError } = await supabase
    .from("vyron_customers")
    .select("*")
    .eq("company_id", companyId)
    .ilike("customer_name", contactName)
    .maybeSingle();

  if (byNameError) throw new Error(byNameError.message);

  if (existingByName) {
    const { data: updated, error: updateError } = await supabase
      .from("vyron_customers")
      .update({
        customer_name: contactName,
        email: contact.email,
        invoice_email: contact.email,
        phone: contact.phone,
        xero_contact_id: xeroContactId || existingByName.xero_contact_id,
        updated_at: now,
      })
      .eq("id", existingByName.id)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);
    return updated;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("vyron_customers")
    .insert({
      company_id: companyId,
      customer_name: contact.contact_name,
      email: contact.email,
      invoice_email: contact.email,
      phone: contact.phone,
      xero_contact_id: xeroContactId,
      active: true,
      status: "Active",
      category: "Customer",
      terms: "30 Days",
      updated_at: now,
    })
    .select("*")
    .single();

  if (insertError) throw new Error(insertError.message);
  return inserted;
}

async function ensureSupplierFromContact(
  supabase: SupabaseClient,
  companyId: string,
  contact: VyronContact
) {
  const now = new Date().toISOString();
  const xeroContactId = contact.xero_contact_id?.trim() || null;
  const contactName = contact.contact_name.trim();

  if (xeroContactId) {
    const { data: existing, error: existingError } = await supabase
      .from("vyron_cost_suppliers")
      .select("*")
      .eq("company_id", companyId)
      .eq("xero_contact_id", xeroContactId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from("vyron_cost_suppliers")
        .update({
          supplier_name: contactName,
          contact_email: contact.email,
          invoice_email: contact.email,
          phone: contact.phone,
          updated_at: now,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateError) throw new Error(updateError.message);
      return updated;
    }
  }

  const { data: existingByName, error: byNameError } = await supabase
    .from("vyron_cost_suppliers")
    .select("*")
    .eq("company_id", companyId)
    .ilike("supplier_name", contactName)
    .maybeSingle();

  if (byNameError) throw new Error(byNameError.message);

  if (existingByName) {
    const { data: updated, error: updateError } = await supabase
      .from("vyron_cost_suppliers")
      .update({
        supplier_name: contactName,
        contact_email: contact.email,
        invoice_email: contact.email,
        phone: contact.phone,
        xero_contact_id: xeroContactId || existingByName.xero_contact_id,
        updated_at: now,
      })
      .eq("id", existingByName.id)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);
    return updated;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("vyron_cost_suppliers")
    .insert({
      id: randomUUID(),
      company_id: companyId,
      supplier_name: contact.contact_name,
      contact_email: contact.email,
      invoice_email: contact.email,
      phone: contact.phone,
      xero_contact_id: xeroContactId,
      category: "Supplier",
      risk_status: "Active",
      payment_terms: "30 Days",
      last_price_movement: 0,
      lead_time_days: 0,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insertError) throw new Error(insertError.message);
  return inserted;
}

export async function updateContactRoles(
  supabase: SupabaseClient,
  companyId: string,
  contactId: string,
  roles: { is_customer?: boolean; is_supplier?: boolean }
): Promise<VyronContact> {
  const contact = await getVyronContactById(supabase, companyId, contactId);
  if (!contact) throw new Error("Contact not found.");

  const isCustomer = roles.is_customer !== undefined ? Boolean(roles.is_customer) : contact.is_customer;
  const isSupplier = roles.is_supplier !== undefined ? Boolean(roles.is_supplier) : contact.is_supplier;
  const now = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("vyron_contacts")
    .update({
      is_customer: isCustomer,
      is_supplier: isSupplier,
      updated_at: now,
    })
    .eq("id", contactId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const nextContact = updated as VyronContact;

  if (isCustomer) {
    await ensureCustomerFromContact(supabase, companyId, nextContact);
  }
  if (isSupplier) {
    await ensureSupplierFromContact(supabase, companyId, nextContact);
  }

  return nextContact;
}

export async function assignCustomerRole(
  supabase: SupabaseClient,
  companyId: string,
  contactId: string
): Promise<VyronContact> {
  return updateContactRoles(supabase, companyId, contactId, { is_customer: true });
}

export async function assignSupplierRole(
  supabase: SupabaseClient,
  companyId: string,
  contactId: string
): Promise<VyronContact> {
  return updateContactRoles(supabase, companyId, contactId, { is_supplier: true });
}

export type BulkContactRoleAction =
  | "mark-customer"
  | "mark-supplier"
  | "mark-both"
  | "remove-customer"
  | "remove-supplier";

export async function bulkUpdateContactRoles(
  supabase: SupabaseClient,
  companyId: string,
  contactIds: string[],
  action: BulkContactRoleAction
): Promise<{ updated: number; contacts: VyronContact[]; errors: string[] }> {
  const uniqueIds = [...new Set(contactIds.map((id) => id.trim()).filter(Boolean))];
  const contacts: VyronContact[] = [];
  const errors: string[] = [];

  for (const contactId of uniqueIds) {
    try {
      const existing = await getVyronContactById(supabase, companyId, contactId);
      if (!existing) {
        errors.push(`${contactId}: Contact not found.`);
        continue;
      }

      let is_customer = existing.is_customer;
      let is_supplier = existing.is_supplier;

      if (action === "mark-customer") is_customer = true;
      if (action === "mark-supplier") is_supplier = true;
      if (action === "mark-both") {
        is_customer = true;
        is_supplier = true;
      }
      if (action === "remove-customer") is_customer = false;
      if (action === "remove-supplier") is_supplier = false;

      const updated = await updateContactRoles(supabase, companyId, contactId, {
        is_customer,
        is_supplier,
      });
      contacts.push(updated);
    } catch (error) {
      errors.push(
        `${contactId}: ${error instanceof Error ? error.message : "Role update failed."}`
      );
    }
  }

  return { updated: contacts.length, contacts, errors };
}

export async function listCustomerContactsAsCustomers(
  supabase: SupabaseClient,
  companyId: string
) {
  const { data: contacts, error: contactError } = await supabase
    .from("vyron_contacts")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_customer", true)
    .order("contact_name");

  if (contactError) throw new Error(contactError.message);

  const { data: customers, error: customerError } = await supabase
    .from("vyron_customers")
    .select("*")
    .eq("company_id", companyId);

  if (customerError) throw new Error(customerError.message);

  const byXero = new Map<string, (typeof customers)[number]>();
  const byName = new Map<string, (typeof customers)[number]>();
  for (const customer of customers || []) {
    if (customer.xero_contact_id) {
      byXero.set(String(customer.xero_contact_id), customer);
    }
    const nameKey = String(customer.customer_name || "").trim().toLowerCase();
    if (nameKey) byName.set(nameKey, customer);
  }

  const result: NonNullable<typeof customers> = [];
  const seenIds = new Set<string>();

  for (const contact of (contacts || []) as VyronContact[]) {
    let customer =
      (contact.xero_contact_id ? byXero.get(contact.xero_contact_id) : null) ||
      byName.get(contact.contact_name.trim().toLowerCase()) ||
      null;

    if (!customer) {
      customer = await ensureCustomerFromContact(supabase, companyId, contact);
    }

    if (!seenIds.has(String(customer.id))) {
      seenIds.add(String(customer.id));
      result.push(customer);
    }
  }

  result.sort((a, b) => String(a.customer_name).localeCompare(String(b.customer_name)));
  return result;
}

export async function listSupplierContactsAsSuppliers(
  supabase: SupabaseClient,
  companyId: string
) {
  const { data: contacts, error: contactError } = await supabase
    .from("vyron_contacts")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_supplier", true)
    .order("contact_name");

  if (contactError) throw new Error(contactError.message);

  const { data: suppliers, error: supplierError } = await supabase
    .from("vyron_cost_suppliers")
    .select("*")
    .eq("company_id", companyId);

  if (supplierError) throw new Error(supplierError.message);

  const byXero = new Map<string, (typeof suppliers)[number]>();
  const byName = new Map<string, (typeof suppliers)[number]>();
  for (const supplier of suppliers || []) {
    if (supplier.xero_contact_id) {
      byXero.set(String(supplier.xero_contact_id), supplier);
    }
    const nameKey = String(supplier.supplier_name || "").trim().toLowerCase();
    if (nameKey) byName.set(nameKey, supplier);
  }

  const result: NonNullable<typeof suppliers> = [];
  const seenIds = new Set<string>();

  for (const contact of (contacts || []) as VyronContact[]) {
    let supplier =
      (contact.xero_contact_id ? byXero.get(contact.xero_contact_id) : null) ||
      byName.get(contact.contact_name.trim().toLowerCase()) ||
      null;

    if (!supplier) {
      supplier = await ensureSupplierFromContact(supabase, companyId, contact);
    }

    if (!seenIds.has(String(supplier.id))) {
      seenIds.add(String(supplier.id));
      result.push(supplier);
    }
  }

  result.sort((a, b) => String(a.supplier_name).localeCompare(String(b.supplier_name)));
  return result;
}
