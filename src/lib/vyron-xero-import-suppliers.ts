import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertVyronContact } from "@/lib/vyron-contact-master";
import { fetchAllXeroSupplierContacts, type XeroContactRecord } from "@/lib/vyron-xero-client";
import { upsertContactMapping } from "@/lib/vyron-xero-mapping";

export type XeroImportSuppliersResult = {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
};

type ExistingSupplierRow = {
  id: string;
  xero_contact_id: string | null;
  supplier_name: string;
  contact_email: string | null;
  phone: string | null;
  xero_contact_status: string | null;
};

function pickPhone(contact: XeroContactRecord) {
  const phones = contact.Phones || [];
  const preferred =
    phones.find((phone) => phone.PhoneType === "DEFAULT") ||
    phones.find((phone) => phone.PhoneType === "MOBILE") ||
    phones[0];
  return preferred?.PhoneNumber?.trim() || null;
}

function mapContactToSupplierRow(companyId: string, contact: XeroContactRecord) {
  const xeroContactStatus = contact.ContactStatus?.trim() || null;
  const active = xeroContactStatus === "ACTIVE";
  const email = contact.EmailAddress?.trim() || null;

  return {
    company_id: companyId,
    supplier_name: String(contact.Name).trim(),
    contact_email: email,
    invoice_email: email,
    phone: pickPhone(contact),
    xero_contact_id: String(contact.ContactID).trim(),
    xero_contact_status: xeroContactStatus,
    active,
    updated_at: new Date().toISOString(),
  };
}

function rowUnchanged(existing: ExistingSupplierRow, next: ReturnType<typeof mapContactToSupplierRow>) {
  return (
    existing.supplier_name === next.supplier_name &&
    (existing.contact_email || null) === (next.contact_email || null) &&
    (existing.phone || null) === (next.phone || null) &&
    (existing.xero_contact_status || null) === (next.xero_contact_status || null)
  );
}

async function syncContactMaster(
  supabase: SupabaseClient,
  companyId: string,
  contact: XeroContactRecord,
  payload: ReturnType<typeof mapContactToSupplierRow>
) {
  await upsertVyronContact(supabase, companyId, {
    contact_name: payload.supplier_name,
    email: payload.contact_email,
    phone: payload.phone,
    xero_contact_id: payload.xero_contact_id,
    is_supplier: true,
  });
}

async function storeContactMapping(workspaceId: string, localId: string, contact: XeroContactRecord) {
  await upsertContactMapping(workspaceId, {
    localType: "supplier",
    localId,
    xeroContactId: String(contact.ContactID),
    xeroContactName: String(contact.Name).trim(),
    lastSyncedAt: new Date().toISOString(),
    syncStatus: "synced",
    lastError: null,
  });
}

export async function importSuppliersFromXero(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  actor = "user"
): Promise<XeroImportSuppliersResult> {
  const fetchedContacts = await fetchAllXeroSupplierContacts(workspaceId, { companyId, actor });
  const contacts = fetchedContacts.filter((contact) => contact.ContactStatus?.trim() === "ACTIVE");

  const { data: existingRows, error: existingError } = await supabase
    .from("vyron_cost_suppliers")
    .select("id, xero_contact_id, supplier_name, contact_email, phone, xero_contact_status")
    .eq("company_id", companyId)
    .not("xero_contact_id", "is", null);

  if (existingError) throw new Error(existingError.message);

  const byXeroId = new Map<string, ExistingSupplierRow>();
  for (const row of existingRows || []) {
    if (row.xero_contact_id) {
      byXeroId.set(String(row.xero_contact_id), row as ExistingSupplierRow);
    }
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const contact of contacts) {
    const xeroContactId = contact.ContactID?.trim();
    const name = contact.Name?.trim();

    if (!xeroContactId || !name) {
      skipped += 1;
      continue;
    }

    const payload = mapContactToSupplierRow(companyId, contact);
    const existing = byXeroId.get(xeroContactId);

    if (existing) {
      if (rowUnchanged(existing, payload)) {
        await syncContactMaster(supabase, companyId, contact, payload);
        skipped += 1;
        continue;
      }

      const { error } = await supabase.from("vyron_cost_suppliers").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);

      await syncContactMaster(supabase, companyId, contact, payload);
      await storeContactMapping(workspaceId, existing.id, contact);
      updated += 1;
      continue;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("vyron_cost_suppliers")
      .insert(payload)
      .select("id")
      .single();

    if (insertError) throw new Error(insertError.message);
    if (!inserted?.id) throw new Error("Supplier insert did not return an id.");

    await syncContactMaster(supabase, companyId, contact, payload);
    await storeContactMapping(workspaceId, String(inserted.id), contact);
    byXeroId.set(xeroContactId, {
      id: String(inserted.id),
      xero_contact_id: xeroContactId,
      supplier_name: payload.supplier_name,
      contact_email: payload.contact_email,
      phone: payload.phone,
      xero_contact_status: payload.xero_contact_status,
    });
    imported += 1;
  }

  return {
    imported,
    updated,
    skipped,
    total: contacts.length,
  };
}
