import type { SupabaseClient } from "@supabase/supabase-js";
import { OrderEngineError, isMissingRelation, isUniqueViolation, raiseDbError } from "@/lib/order-engine/errors";
import { cleanText, normalizeEmail } from "@/lib/order-engine/normalize";
import type { OrderEngineActor } from "@/lib/order-engine/types";

/**
 * Receiving mailboxes.
 *
 * The tenant of an inbound message is decided by the address it was sent TO —
 * never by anything inside the message. Addresses are globally unique, so one
 * receiving address belongs to exactly one company.
 *
 * A mailbox also carries its acceptance policy: which senders are expected,
 * what attachments are allowed, and whether the provider's sender verification
 * must pass. Nothing is accepted automatically until a policy is set.
 */

const T_MAILBOXES = "vyron_order_mailboxes";

export type MailboxRow = {
  id: string;
  company_id: string;
  receiving_address: string;
  label: string | null;
  provider: string | null;
  status: "ACTIVE" | "DISABLED";
  allowed_sender_domains: string[] | null;
  allowed_senders: string[] | null;
  max_attachment_bytes: number | null;
  allowed_mime_types: string[] | null;
  require_verified_sender: boolean;
  updated_by: string;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
};

export async function listMailboxes(supabase: SupabaseClient, companyId: string): Promise<MailboxRow[]> {
  const { data, error } = await supabase.from(T_MAILBOXES).select("*").eq("company_id", companyId).order("receiving_address", { ascending: true });
  if (error) {
    if (isMissingRelation(error)) return [];
    raiseDbError(error, "Load mailboxes failed");
  }
  return ((data || []) as MailboxRow[]).sort((a, b) => a.receiving_address.localeCompare(b.receiving_address));
}

/**
 * The company a message addressed to `address` belongs to. A connector MUST
 * use this and nothing else to choose the tenant. An unknown or disabled
 * address resolves to nothing — the message is not processed.
 */
export async function resolveMailboxByAddress(
  supabase: SupabaseClient,
  address: string
): Promise<{ mailbox: MailboxRow; companyId: string } | null> {
  const wanted = normalizeEmail(address);
  if (!wanted.includes("@")) return null;
  const { data, error } = await supabase.from(T_MAILBOXES).select("*").ilike("receiving_address", wanted);
  if (error) {
    if (isMissingRelation(error)) return null;
    raiseDbError(error, "Mailbox lookup failed");
  }
  const rows = ((data || []) as MailboxRow[]).filter((row) => normalizeEmail(row.receiving_address) === wanted);
  if (rows.length !== 1) return null;
  const mailbox = rows[0];
  if (mailbox.status !== "ACTIVE") return null;
  return { mailbox, companyId: mailbox.company_id };
}

export type MailboxInput = {
  id?: string | null;
  receivingAddress: string;
  label?: string | null;
  provider?: string | null;
  status?: string;
  allowedSenderDomains?: string[] | null;
  allowedSenders?: string[] | null;
  maxAttachmentBytes?: number | string | null;
  allowedMimeTypes?: string[] | null;
  requireVerifiedSender?: boolean;
};

const addressList = (value: unknown, label: string, normalise: (v: string) => string): string[] | null => {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) throw new OrderEngineError("INVALID_INPUT", `${label} must be a list.`);
  const list = [...new Set(value.map((v) => normalise(String(v))).filter(Boolean))];
  if (!list.length) return null;
  if (list.length > 200) throw new OrderEngineError("INVALID_INPUT", `${label}: at most 200 entries.`);
  return list;
};

export function normalizeMailboxInput(input: MailboxInput) {
  const address = normalizeEmail(input.receivingAddress);
  if (!address.includes("@") || address.length < 5) throw new OrderEngineError("INVALID_INPUT", "A receiving address is required.");
  const status = input.status ?? "DISABLED";
  if (status !== "ACTIVE" && status !== "DISABLED") throw new OrderEngineError("INVALID_INPUT", "Mailbox status must be ACTIVE or DISABLED.");
  let maxBytes: number | null = null;
  if (input.maxAttachmentBytes !== null && input.maxAttachmentBytes !== undefined && String(input.maxAttachmentBytes).trim() !== "") {
    maxBytes = Number(input.maxAttachmentBytes);
    if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 52_428_800) {
      throw new OrderEngineError("INVALID_INPUT", "The attachment limit must be between 1 KB and 50 MB.");
    }
  }
  return {
    receiving_address: address,
    label: cleanText(input.label, 160),
    provider: cleanText(input.provider, 60),
    status,
    allowed_sender_domains: addressList(input.allowedSenderDomains, "Allowed sender domains", (v) => v.trim().toLowerCase().replace(/^@/, "")),
    allowed_senders: addressList(input.allowedSenders, "Allowed senders", (v) => normalizeEmail(v)),
    max_attachment_bytes: maxBytes,
    allowed_mime_types: addressList(input.allowedMimeTypes, "Allowed attachment types", (v) => v.trim().toLowerCase()),
    require_verified_sender: input.requireVerifiedSender === true,
  };
}

export async function saveMailbox(supabase: SupabaseClient, companyId: string, input: MailboxInput, actor: OrderEngineActor): Promise<MailboxRow[]> {
  const values = normalizeMailboxInput(input);
  // One receiving address belongs to exactly one company: it is what decides
  // the tenant of every message sent to it. (The database enforces this too.)
  const { data: claimed, error: claimError } = await supabase.from(T_MAILBOXES).select("id, company_id").ilike("receiving_address", values.receiving_address);
  if (claimError && !isMissingRelation(claimError)) raiseDbError(claimError, "Mailbox lookup failed");
  const taken = ((claimed || []) as Array<{ id: string; company_id: string }>).find(
    (row) => row.company_id !== companyId || row.id !== cleanText(input.id, 64)
  );
  if (taken && taken.company_id !== companyId) {
    throw new OrderEngineError("INVALID_INPUT", "That receiving address is already used by another workspace. One address belongs to exactly one company.");
  }
  if (taken && !input.id) {
    throw new OrderEngineError("INVALID_INPUT", "That receiving address is already configured for this company.");
  }
  const now = new Date().toISOString();
  const row = { ...values, updated_by: actor.userId, updated_by_name: actor.name, updated_at: now };
  const id = cleanText(input.id, 64);
  let error;
  if (id) {
    const existing = (await listMailboxes(supabase, companyId)).find((m) => m.id === id);
    if (!existing) throw new OrderEngineError("NOT_FOUND", "That mailbox does not exist in this company.");
    ({ error } = await supabase.from(T_MAILBOXES).update(row).eq("company_id", companyId).eq("id", id));
  } else {
    ({ error } = await supabase.from(T_MAILBOXES).insert({ company_id: companyId, ...row, created_at: now }));
  }
  if (error) {
    if (isMissingRelation(error)) throw new OrderEngineError("NOT_ENABLED", "Mailboxes are not enabled on this database yet.");
    if (isUniqueViolation(error)) {
      throw new OrderEngineError("INVALID_INPUT", "That receiving address is already used. One address belongs to exactly one company.");
    }
    raiseDbError(error, "Save mailbox failed");
  }
  return listMailboxes(supabase, companyId);
}

export async function deleteMailbox(supabase: SupabaseClient, companyId: string, id: string): Promise<MailboxRow[]> {
  const { error } = await supabase.from(T_MAILBOXES).delete().eq("company_id", companyId).eq("id", id);
  if (error) raiseDbError(error, "Delete mailbox failed");
  return listMailboxes(supabase, companyId);
}
