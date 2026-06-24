import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertVyronContact, type VyronContact } from "@/lib/vyron-contact-master";
import { fetchAllXeroContacts, type XeroContactRecord } from "@/lib/vyron-xero-client";

export type XeroImportContactsResult = {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
};

function pickPhone(contact: XeroContactRecord) {
  const phones = contact.Phones || [];
  const preferred =
    phones.find((phone) => phone.PhoneType === "DEFAULT") ||
    phones.find((phone) => phone.PhoneType === "MOBILE") ||
    phones[0];
  return preferred?.PhoneNumber?.trim() || null;
}

function mapXeroContactToMaster(contact: XeroContactRecord) {
  return {
    contact_name: String(contact.Name).trim(),
    email: contact.EmailAddress?.trim() || null,
    phone: pickPhone(contact),
    xero_contact_id: String(contact.ContactID).trim(),
  };
}

function rowUnchanged(
  existing: Pick<VyronContact, "contact_name" | "email" | "phone">,
  next: ReturnType<typeof mapXeroContactToMaster>
) {
  return (
    existing.contact_name === next.contact_name &&
    (existing.email || null) === (next.email || null) &&
    (existing.phone || null) === (next.phone || null)
  );
}

export async function importContactsFromXero(
  supabase: SupabaseClient,
  workspaceId: string,
  companyId: string,
  actor = "user"
): Promise<XeroImportContactsResult> {
  const fetchedContacts = await fetchAllXeroContacts(workspaceId, { companyId, actor });
  const contacts = fetchedContacts.filter((contact) => contact.ContactStatus?.trim() === "ACTIVE");

  const { data: existingRows, error: existingError } = await supabase
    .from("vyron_contacts")
    .select("id, contact_name, email, phone, xero_contact_id")
    .eq("company_id", companyId)
    .not("xero_contact_id", "is", null);

  if (existingError) throw new Error(existingError.message);

  const byXeroId = new Map<string, VyronContact>();
  for (const row of existingRows || []) {
    if (row.xero_contact_id) {
      byXeroId.set(String(row.xero_contact_id), row as VyronContact);
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

    const payload = mapXeroContactToMaster(contact);
    const existing = byXeroId.get(xeroContactId);

    if (existing && rowUnchanged(existing, payload)) {
      skipped += 1;
      continue;
    }

    const result = await upsertVyronContact(supabase, companyId, payload);
    if (result === "imported") imported += 1;
    else updated += 1;
  }

  return {
    imported,
    updated,
    skipped,
    total: contacts.length,
  };
}
