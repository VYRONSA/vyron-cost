import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OrderEngineError, isUniqueViolation, raiseDbError } from "@/lib/order-engine/errors";
import { cleanText, normalizeEmail } from "@/lib/order-engine/normalize";
import { assertInboundEmail, parseInboundEmail, type InboundEmailMessage } from "@/lib/order-engine/adapters/email";
import { receiveOrderCandidate, type ReceiveResult } from "@/lib/order-engine/service";
import type { OrderEngineActor } from "@/lib/order-engine/types";

/**
 * Receive one inbound e-mail for a company. NOT wired to any mailbox: a future
 * provider webhook must verify the provider's signature and resolve the
 * company from the receiving address (never from the payload) before calling
 * this. Today it is called only by tests.
 *
 * Idempotent on (company, "email", message id): the same message delivered
 * twice is stored once and produces its orders once.
 */

export type InboundEmailResult = {
  messageRowId: string;
  duplicate: boolean;
  status: "PARSED" | "NO_ORDER_FOUND" | "FAILED";
  orders: ReceiveResult[];
  reason: string | null;
};

const T_MESSAGES = "vyron_order_source_messages";

export async function receiveInboundEmail(
  supabase: SupabaseClient,
  companyId: string,
  message: InboundEmailMessage,
  actor: OrderEngineActor
): Promise<InboundEmailResult> {
  try {
    assertInboundEmail(message);
  } catch (error) {
    throw new OrderEngineError("INVALID_INPUT", error instanceof Error ? error.message : "Invalid message.");
  }
  const messageId = message.messageId.trim();

  const { data: existing, error: existingError } = await supabase
    .from(T_MESSAGES)
    .select("id, processing_status, processing_error")
    .eq("company_id", companyId)
    .eq("channel", "email")
    .eq("message_id", messageId)
    .maybeSingle();
  if (existingError) raiseDbError(existingError, "Message lookup failed");
  if (existing) {
    const row = existing as { id: string; processing_status: InboundEmailResult["status"]; processing_error: string | null };
    return { messageRowId: row.id, duplicate: true, status: row.processing_status, orders: [], reason: row.processing_error };
  }

  const now = new Date().toISOString();
  const rowId = randomUUID();
  const { error: insertError } = await supabase.from(T_MESSAGES).insert({
    id: rowId,
    company_id: companyId,
    channel: "email",
    provider: cleanText(message.provider, 60) || "unknown",
    message_id: messageId,
    from_address: normalizeEmail(message.from),
    to_addresses: (message.to || []).map(normalizeEmail),
    cc_addresses: (message.cc || []).map(normalizeEmail),
    subject: cleanText(message.subject, 500),
    received_at: new Date(message.receivedAt).toISOString(),
    body_text: cleanText(message.bodyText, 100_000),
    // Metadata only: attachment bytes live in storage, never in this row.
    attachments: message.attachments.map((a) => ({
      fileName: a.fileName,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      sha256: a.sha256 ?? null,
      storagePath: a.storagePath ?? null,
    })),
    processing_status: "RECEIVED",
    created_at: now,
    updated_at: now,
  });
  if (insertError) {
    if (isUniqueViolation(insertError)) {
      // A concurrent delivery of the same message won the insert.
      const { data: winner } = await supabase
        .from(T_MESSAGES)
        .select("id, processing_status, processing_error")
        .eq("company_id", companyId)
        .eq("channel", "email")
        .eq("message_id", messageId)
        .maybeSingle();
      if (winner) {
        const row = winner as { id: string; processing_status: InboundEmailResult["status"]; processing_error: string | null };
        return { messageRowId: row.id, duplicate: true, status: row.processing_status, orders: [], reason: row.processing_error };
      }
    }
    raiseDbError(insertError, "Store message failed");
  }

  const finish = async (status: InboundEmailResult["status"], reason: string | null, intakeId: string | null) => {
    const { error } = await supabase
      .from(T_MESSAGES)
      .update({ processing_status: status, processing_error: reason, intake_id: intakeId, updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", rowId);
    if (error) raiseDbError(error, "Update message failed");
  };

  let parsed: ReturnType<typeof parseInboundEmail>;
  try {
    parsed = parseInboundEmail(message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "The message could not be read.";
    await finish("FAILED", reason, null);
    return { messageRowId: rowId, duplicate: false, status: "FAILED", orders: [], reason };
  }
  if (parsed.kind === "no_order") {
    await finish("NO_ORDER_FOUND", parsed.reason, null);
    return { messageRowId: rowId, duplicate: false, status: "NO_ORDER_FOUND", orders: [], reason: parsed.reason };
  }

  const orders: ReceiveResult[] = [];
  try {
    for (const candidate of parsed.candidates) {
      orders.push(await receiveOrderCandidate(supabase, companyId, candidate, actor, { sourceMessageId: rowId }));
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "An order in the message could not be received.";
    await finish("FAILED", reason, orders[0]?.intake.id ?? null);
    return { messageRowId: rowId, duplicate: false, status: "FAILED", orders, reason };
  }
  await finish("PARSED", null, orders[0]?.intake.id ?? null);
  return { messageRowId: rowId, duplicate: false, status: "PARSED", orders, reason: null };
}
