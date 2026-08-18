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
    query = query.eq("is_customer", true);
  } else if (filter === "supplier") {
    query = query.eq("is_supplier", true);
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

/**
 * Contacts is the master-data classification layer, so every customer and
 * supplier master record must be represented there. This backfills only the
 * records that have no contact yet — existing contacts (and their Customer /
 * Supplier / Customer+Supplier classification) are never touched, so it is
 * safe to call on every read and writes nothing once the company is in sync.
 * All queries are scoped by company_id, preserving company isolation.
 */
export async function ensureContactsForMasterRecords(
  supabase: SupabaseClient,
  companyId: string
): Promise<{ created: number }> {
  const [{ data: contacts }, { data: customers }, { data: suppliers }] = await Promise.all([
    supabase.from("vyron_contacts").select("contact_name, xero_contact_id").eq("company_id", companyId),
    supabase.from("vyron_customers").select("customer_name, email, phone, xero_contact_id").eq("company_id", companyId),
    supabase.from("vyron_cost_suppliers").select("supplier_name, contact_email, xero_contact_id").eq("company_id", companyId),
  ]);

  const nameKeys = new Set<string>();
  const xeroKeys = new Set<string>();
  for (const contact of contacts || []) {
    const key = String(contact.contact_name || "").trim().toLowerCase();
    if (key) nameKeys.add(key);
    if (contact.xero_contact_id) xeroKeys.add(String(contact.xero_contact_id));
  }

  const missing: ContactUpsertInput[] = [];

  const isMissing = (name: string, xeroId: unknown) => {
    const key = name.trim().toLowerCase();
    if (!key) return false;
    if (xeroId && xeroKeys.has(String(xeroId))) return false;
    return !nameKeys.has(key);
  };

  for (const customer of customers || []) {
    const name = String(customer.customer_name || "").trim();
    if (!isMissing(name, customer.xero_contact_id)) continue;
    nameKeys.add(name.toLowerCase());
    missing.push({
      contact_name: name,
      email: customer.email,
      phone: customer.phone,
      xero_contact_id: customer.xero_contact_id,
      is_customer: true,
    });
  }

  for (const supplier of suppliers || []) {
    const name = String(supplier.supplier_name || "").trim();
    if (!isMissing(name, supplier.xero_contact_id)) continue;
    nameKeys.add(name.toLowerCase());
    missing.push({
      contact_name: name,
      email: supplier.contact_email,
      xero_contact_id: supplier.xero_contact_id,
      is_supplier: true,
    });
  }

  for (const input of missing) {
    await upsertVyronContact(supabase, companyId, input);
  }

  return { created: missing.length };
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
    if (row.is_customer) customers += 1;
    if (row.is_supplier) suppliers += 1;
    if (row.is_customer && row.is_supplier) both += 1;
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

export async function deleteVyronContact(
  supabase: SupabaseClient,
  companyId: string,
  contactId: string
) {
  const { error } = await supabase
    .from("vyron_contacts")
    .delete()
    .eq("company_id", companyId)
    .eq("id", contactId);

  if (error) throw new Error(error.message);
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

const BULK_SYNC_CHUNK_SIZE = 25;

async function syncRoleProjectionsForBulk(
  supabase: SupabaseClient,
  companyId: string,
  contacts: VyronContact[],
  action: BulkContactRoleAction
) {
  const syncCustomer = action === "mark-customer" || action === "mark-both";
  const syncSupplier = action === "mark-supplier" || action === "mark-both";
  if (!syncCustomer && !syncSupplier) return;

  const candidates = contacts.filter(
    (contact) =>
      (syncCustomer && contact.is_customer) || (syncSupplier && contact.is_supplier)
  );
  if (!candidates.length) return;

  for (let index = 0; index < candidates.length; index += BULK_SYNC_CHUNK_SIZE) {
    const chunk = candidates.slice(index, index + BULK_SYNC_CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (contact) => {
        if (syncCustomer && contact.is_customer) {
          await ensureCustomerFromContact(supabase, companyId, contact);
        }
        if (syncSupplier && contact.is_supplier) {
          await ensureSupplierFromContact(supabase, companyId, contact);
        }
      })
    );
  }
}

function queueBulkProjectionSync(
  supabase: SupabaseClient,
  companyId: string,
  contacts: VyronContact[],
  action: BulkContactRoleAction
) {
  if (!contacts.length) return;
  setTimeout(() => {
    void syncRoleProjectionsForBulk(supabase, companyId, contacts, action).catch(() => {
      // Non-blocking best-effort sync.
    });
  }, 0);
}

export async function bulkUpdateContactRoles(
  supabase: SupabaseClient,
  companyId: string,
  contactIds: string[],
  action: BulkContactRoleAction
): Promise<{
  processed: number;
  updated: number;
  failed: number;
  contacts: VyronContact[];
  errors: string[];
}> {
  const uniqueIds = [...new Set(contactIds.map((id) => id.trim()).filter(Boolean))];
  let contacts: VyronContact[] = [];
  const errors: string[] = [];

  if (!uniqueIds.length) {
    return { processed: 0, updated: 0, failed: 0, contacts, errors };
  }

  const { data: existingRows, error: loadError } = await supabase
    .from("vyron_contacts")
    .select("*")
    .eq("company_id", companyId)
    .in("id", uniqueIds);

  if (loadError) throw new Error(loadError.message);

  const byId = new Map((existingRows || []).map((row) => [String(row.id), row as VyronContact]));
  for (const contactId of uniqueIds) {
    if (!byId.has(contactId)) {
      errors.push(`${contactId}: Contact not found.`);
    }
  }
  const updateIds = uniqueIds.filter((contactId) => byId.has(contactId));
  if (!updateIds.length) {
    return {
      processed: uniqueIds.length,
      updated: 0,
      failed: errors.length,
      contacts,
      errors,
    };
  }

  const now = new Date().toISOString();
  let patch: Partial<VyronContact> & { updated_at: string };
  if (action === "mark-customer") {
    patch = { is_customer: true, updated_at: now };
  } else if (action === "mark-supplier") {
    patch = { is_supplier: true, updated_at: now };
  } else if (action === "mark-both") {
    patch = { is_customer: true, is_supplier: true, updated_at: now };
  } else if (action === "remove-customer") {
    patch = { is_customer: false, updated_at: now };
  } else {
    patch = { is_supplier: false, updated_at: now };
  }

  const { data: updatedRows, error: batchError } = await supabase
    .from("vyron_contacts")
    .update(patch)
    .eq("company_id", companyId)
    .in("id", updateIds)
    .select("*");

  if (batchError) {
    for (const contactId of updateIds) {
      errors.push(`${contactId}: ${batchError.message}`);
    }
  } else {
    contacts = ((updatedRows || []) as VyronContact[]).filter((contact) => updateIds.includes(contact.id));
    queueBulkProjectionSync(supabase, companyId, contacts, action);
  }

  return {
    processed: uniqueIds.length,
    updated: contacts.length,
    failed: errors.length,
    contacts,
    errors,
  };
}

export type ContactMasterRepairCounts = {
  contactsTotal: number;
  contactsIsCustomer: number;
  contactsIsSupplier: number;
  vyronCustomers: number;
  vyronSuppliers: number;
};

export type ContactMasterRepairResult = {
  before: ContactMasterRepairCounts;
  after: ContactMasterRepairCounts;
  customerFlagsRepaired: number;
  supplierFlagsRepaired: number;
  unmatchedCustomers: number;
  unmatchedSuppliers: number;
};

function normalizeContactEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function normalizeContactName(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

async function getContactMasterRepairCounts(
  supabase: SupabaseClient,
  companyId: string
): Promise<ContactMasterRepairCounts> {
  const [
    { count: contactsTotal },
    { count: contactsIsCustomer },
    { count: contactsIsSupplier },
    { count: vyronCustomers },
    { count: vyronSuppliers },
  ] = await Promise.all([
    supabase.from("vyron_contacts").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase
      .from("vyron_contacts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_customer", true),
    supabase
      .from("vyron_contacts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_supplier", true),
    supabase.from("vyron_customers").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase
      .from("vyron_cost_suppliers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
  ]);

  return {
    contactsTotal: contactsTotal || 0,
    contactsIsCustomer: contactsIsCustomer || 0,
    contactsIsSupplier: contactsIsSupplier || 0,
    vyronCustomers: vyronCustomers || 0,
    vyronSuppliers: vyronSuppliers || 0,
  };
}

function findContactForMasterRecord(
  contacts: VyronContact[],
  record: {
    xero_contact_id?: string | null;
    name: string;
    email?: string | null;
  }
): VyronContact | null {
  const xeroId = record.xero_contact_id?.trim();
  if (xeroId) {
    const byXero = contacts.find((contact) => contact.xero_contact_id?.trim() === xeroId);
    if (byXero) return byXero;
  }

  const nameKey = normalizeContactName(record.name);
  if (nameKey) {
    const byName = contacts.find((contact) => normalizeContactName(contact.contact_name) === nameKey);
    if (byName) return byName;
  }

  const emailKey = normalizeContactEmail(record.email);
  if (emailKey) {
    const byEmail = contacts.find((contact) => normalizeContactEmail(contact.email) === emailKey);
    if (byEmail) return byEmail;
  }

  return null;
}

export async function repairContactMasterFlags(
  supabase: SupabaseClient,
  companyId: string
): Promise<ContactMasterRepairResult> {
  const before = await getContactMasterRepairCounts(supabase, companyId);

  const [{ data: contacts, error: contactError }, { data: customers, error: customerError }, { data: suppliers, error: supplierError }] =
    await Promise.all([
      supabase.from("vyron_contacts").select("*").eq("company_id", companyId),
      supabase.from("vyron_customers").select("id, customer_name, email, invoice_email, xero_contact_id").eq("company_id", companyId),
      supabase
        .from("vyron_cost_suppliers")
        .select("id, supplier_name, contact_email, invoice_email, xero_contact_id")
        .eq("company_id", companyId),
    ]);

  if (contactError) throw new Error(contactError.message);
  if (customerError) throw new Error(customerError.message);
  if (supplierError) throw new Error(supplierError.message);

  const contactRows = (contacts || []) as VyronContact[];
  const flagUpdates = new Map<string, { is_customer?: boolean; is_supplier?: boolean }>();
  let unmatchedCustomers = 0;
  let unmatchedSuppliers = 0;

  function queueFlag(contactId: string, patch: { is_customer?: boolean; is_supplier?: boolean }) {
    const current = flagUpdates.get(contactId) || {};
    flagUpdates.set(contactId, { ...current, ...patch });
  }

  for (const customer of customers || []) {
    const contact = findContactForMasterRecord(contactRows, {
      xero_contact_id: customer.xero_contact_id,
      name: String(customer.customer_name || ""),
      email: customer.email || customer.invoice_email,
    });
    if (!contact) {
      unmatchedCustomers += 1;
      continue;
    }
    if (!contact.is_customer) {
      queueFlag(contact.id, { is_customer: true });
    }
  }

  for (const supplier of suppliers || []) {
    const contact = findContactForMasterRecord(contactRows, {
      xero_contact_id: supplier.xero_contact_id,
      name: String(supplier.supplier_name || ""),
      email: supplier.contact_email || supplier.invoice_email,
    });
    if (!contact) {
      unmatchedSuppliers += 1;
      continue;
    }
    if (!contact.is_supplier) {
      queueFlag(contact.id, { is_supplier: true });
    }
  }

  let customerFlagsRepaired = 0;
  let supplierFlagsRepaired = 0;
  const now = new Date().toISOString();

  for (const [contactId, patch] of flagUpdates.entries()) {
    const existing = contactRows.find((row) => row.id === contactId);
    if (!existing) continue;

    const nextCustomer = patch.is_customer !== undefined ? patch.is_customer : existing.is_customer;
    const nextSupplier = patch.is_supplier !== undefined ? patch.is_supplier : existing.is_supplier;

    if (nextCustomer === existing.is_customer && nextSupplier === existing.is_supplier) continue;

    const { error } = await supabase
      .from("vyron_contacts")
      .update({
        is_customer: nextCustomer,
        is_supplier: nextSupplier,
        updated_at: now,
      })
      .eq("id", contactId)
      .eq("company_id", companyId);

    if (error) throw new Error(error.message);

    if (patch.is_customer && !existing.is_customer) customerFlagsRepaired += 1;
    if (patch.is_supplier && !existing.is_supplier) supplierFlagsRepaired += 1;
  }

  const after = await getContactMasterRepairCounts(supabase, companyId);

  return {
    before,
    after,
    customerFlagsRepaired,
    supplierFlagsRepaired,
    unmatchedCustomers,
    unmatchedSuppliers,
  };
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

  /**
   * vyron_customers is the canonical customer master — CSV imports write there
   * directly and may never have a matching contact row. Previously this function
   * iterated contacts only, so imported customers were silently invisible.
   * Both queries are already scoped by company_id, so company isolation holds.
   */
  for (const customer of customers || []) {
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
