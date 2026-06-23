import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllXeroCustomerContacts, type XeroContactRecord } from "@/lib/vyron-xero-client";
import { upsertContactMapping } from "@/lib/vyron-xero-mapping";

export type XeroImportCustomersResult = {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
};

type ExistingCustomerRow = {
  id: string;
  xero_contact_id: string | null;
  customer_name: string;
  email: string | null;
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

function mapContactToCustomerRow(companyId: string, contact: XeroContactRecord) {
  const xeroContactStatus = contact.ContactStatus?.trim() || null;
  const active = xeroContactStatus !== "ARCHIVED";
  const email = contact.EmailAddress?.trim() || null;

  return {
    company_id: companyId,
    customer_name: String(contact.Name).trim(),
    email,
    invoice_email: email,
    phone: pickPhone(contact),
    xero_contact_id: String(contact.ContactID).trim(),
    xero_contact_status: xeroContactStatus,
    active,
    status: active ? "Active" : "Inactive",
    updated_at: new Date().toISOString(),
  };
}

function rowUnchanged(existing: ExistingCustomerRow, next: ReturnType<typeof mapContactToCustomerRow>) {
  return (
    existing.customer_name === next.customer_name &&
    (existing.email || null) === (next.email || null) &&
    (existing.phone || null) === (next.phone || null) &&
    (existing.xero_contact_status || null) === (next.xero_contact_status || null)
  );
}

async function storeContactMapping(
  workspaceId: string,
  localId: string,
  contact: XeroContactRecord
) {
  await upsertContactMapping(workspaceId, {
    localType: "customer",
    localId,
    xeroContactId: String(contact.ContactID),
    xeroContactName: String(contact.Name).trim(),
    lastSyncedAt: new Date().toISOString(),
    syncStatus: "synced",
    lastError: null,
  });
}

export async function importCustomersFromXero(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  actor = "user"
): Promise<XeroImportCustomersResult> {
  const contacts = await fetchAllXeroCustomerContacts(workspaceId, { companyId, actor });

  const { data: existingRows, error: existingError } = await supabase
    .from("vyron_customers")
    .select("id, xero_contact_id, customer_name, email, phone, xero_contact_status")
    .eq("company_id", companyId)
    .not("xero_contact_id", "is", null);

  if (existingError) throw new Error(existingError.message);

  const byXeroId = new Map<string, ExistingCustomerRow>();
  for (const row of existingRows || []) {
    if (row.xero_contact_id) {
      byXeroId.set(String(row.xero_contact_id), row as ExistingCustomerRow);
    }
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const contact of contacts) {
    const xeroContactId = contact.ContactID?.trim();
    const name = contact.Name?.trim();

    if (!xeroContactId || !name || contact.IsCustomer === false) {
      skipped += 1;
      continue;
    }

    const payload = mapContactToCustomerRow(companyId, contact);
    const existing = byXeroId.get(xeroContactId);

    if (existing) {
      if (rowUnchanged(existing, payload)) {
        skipped += 1;
        continue;
      }

      const { error } = await supabase.from("vyron_customers").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);

      await storeContactMapping(workspaceId, existing.id, contact);
      updated += 1;
      continue;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("vyron_customers")
      .insert(payload)
      .select("id")
      .single();

    if (insertError) throw new Error(insertError.message);
    if (!inserted?.id) throw new Error("Customer insert did not return an id.");

    await storeContactMapping(workspaceId, String(inserted.id), contact);
    byXeroId.set(xeroContactId, {
      id: String(inserted.id),
      xero_contact_id: xeroContactId,
      customer_name: payload.customer_name,
      email: payload.email,
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
