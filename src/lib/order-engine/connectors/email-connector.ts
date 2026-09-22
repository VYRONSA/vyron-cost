import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OrderEngineError, isMissingRelation, raiseDbError } from "@/lib/order-engine/errors";
import { cleanText, normalizeEmail } from "@/lib/order-engine/normalize";
import { attachmentHash, judgeInboundEmail, type EmailJudgement, type SenderVerification } from "@/lib/order-engine/email-security";
import { resolveMailboxByAddress, type MailboxRow } from "@/lib/order-engine/mailboxes";
import { receiveInboundEmail, type InboundEmailResult } from "@/lib/order-engine/email-intake";
import { loadOrderSettings } from "@/lib/order-engine/settings";
import { assertChannelActive, recordChannelActivity } from "@/lib/order-engine/activation";
import { extractDocument } from "@/lib/order-engine/extractors/pdf";
import { isPdfAttachment, type InboundEmailMessage } from "@/lib/order-engine/adapters/email";
import type { OrderEngineActor } from "@/lib/order-engine/types";

/**
 * The inbound e-mail connector boundary.
 *
 * NOT CONNECTED: no mailbox, provider or credential exists. This is the
 * contract a provider webhook must satisfy, and the only supported way in:
 *
 *   1. The provider authenticates itself (its own signature check) and hands
 *      over the message with the address it was DELIVERED TO.
 *   2. The tenant is resolved from that receiving address
 *      (vyron_order_mailboxes) — never from the message body, sender or
 *      subject. An unknown or disabled address is refused.
 *   3. The message is judged (sender policy, attachment type and size,
 *      duplicates, the provider's own SPF/DKIM/DMARC results when supplied).
 *      Anything not accepted is stored and quarantined for a person.
 *   4. Accepted messages go through the existing e-mail intake: CSV and Excel
 *      attachments become orders; PDFs are held for extraction and recorded as
 *      an extraction attempt (NOT_CONFIGURED until a provider is registered).
 */

const T_MESSAGES = "vyron_order_source_messages";
const T_EXTRACTIONS = "vyron_order_document_extractions";

export type ConnectorMessage = InboundEmailMessage & {
  /** The address the provider delivered this message to. Decides the tenant. */
  deliveredTo: string;
  /** The provider's own sender-verification results, when it supplies them. */
  verification?: SenderVerification | null;
};

export type ConnectorResult =
  | { status: "NO_MAILBOX"; reason: string }
  | { status: "CHANNEL_NOT_ACTIVE"; companyId: string; mailboxId: string; reason: string }
  | { status: "QUARANTINED"; companyId: string; mailboxId: string; messageRowId: string; judgement: EmailJudgement }
  | { status: "ACCEPTED"; companyId: string; mailboxId: string; result: InboundEmailResult; judgement: EmailJudgement };

/** Attachment hashes already seen for this company, so the same file is not processed twice. */
async function knownAttachmentHashes(supabase: SupabaseClient, companyId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from(T_MESSAGES)
    .select("message_id, attachments")
    .eq("company_id", companyId)
    .order("received_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingRelation(error)) return new Map();
    raiseDbError(error, "Message history lookup failed");
  }
  const seen = new Map<string, string>();
  for (const row of (data || []) as Array<{ message_id: string; attachments: Array<{ sha256?: string | null; fileName?: string }> | null }>) {
    for (const attachment of row.attachments || []) {
      const sha = attachment.sha256 ? String(attachment.sha256).toLowerCase() : null;
      if (sha && !seen.has(sha)) seen.set(sha, `${attachment.fileName || "attachment"} in ${row.message_id}`);
    }
  }
  return seen;
}

/** Store a message that will not be processed, so a person can see why. */
async function quarantine(
  supabase: SupabaseClient,
  companyId: string,
  mailbox: MailboxRow,
  message: ConnectorMessage,
  judgement: EmailJudgement
): Promise<string> {
  const now = new Date().toISOString();
  const rowId = randomUUID();
  const { error } = await supabase.from(T_MESSAGES).insert({
    id: rowId,
    company_id: companyId,
    channel: "email",
    provider: cleanText(message.provider, 60) || "unknown",
    message_id: message.messageId.trim(),
    mailbox_id: mailbox.id,
    from_address: normalizeEmail(message.from),
    to_addresses: (message.to || []).map(normalizeEmail),
    cc_addresses: (message.cc || []).map(normalizeEmail),
    subject: cleanText(message.subject, 500),
    received_at: new Date(message.receivedAt).toISOString(),
    body_text: cleanText(message.bodyText, 100_000),
    attachments: judgement.attachments.map((a) => ({ fileName: a.fileName, contentType: a.contentType, sizeBytes: a.sizeBytes, sha256: a.sha256, accepted: a.accepted, reason: a.reason })),
    sender_verification: judgement.verification,
    processing_status: "QUARANTINED",
    processing_error: judgement.summary,
    created_at: now,
    updated_at: now,
  });
  if (error && !isMissingRelation(error)) raiseDbError(error, "Store message failed");
  return rowId;
}

/** Record what happened (or could not happen) to a document attachment. */
export async function recordDocumentExtraction(
  supabase: SupabaseClient,
  companyId: string,
  input: { messageRowId: string | null; fileName: string; contentType: string; sizeBytes: number; sha256: string | null; extractorId: string | null },
  actor: OrderEngineActor
): Promise<{ status: string; provider: string | null; reason: string | null }> {
  let channelActive = true;
  let inactiveReason: string | null = null;
  try {
    await assertChannelActive(supabase, companyId, "pdf");
  } catch (error) {
    channelActive = false;
    inactiveReason = error instanceof OrderEngineError ? error.message : "The PDF channel is not active.";
  }
  const attempt = await extractDocument(
    { fileName: input.fileName, contentType: input.contentType, sizeBytes: input.sizeBytes, sha256: input.sha256 },
    { companyId, extractorId: input.extractorId, channelActive, inactiveReason }
  );
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    company_id: companyId,
    source_message_id: input.messageRowId,
    attachment_name: input.fileName,
    attachment_sha256: input.sha256,
    attachment_bytes: input.sizeBytes,
    provider: attempt.status === "NOT_CONFIGURED" ? null : attempt.provider,
    status: attempt.status,
    confidence: attempt.status === "SUCCEEDED" ? attempt.confidence : null,
    page_count: attempt.status === "SUCCEEDED" ? attempt.pageCount : null,
    raw: attempt.status === "NOT_CONFIGURED" ? {} : attempt.raw || {},
    normalized: attempt.status === "SUCCEEDED" ? (attempt.extraction as unknown as Record<string, unknown>) : {},
    error: attempt.status === "FAILED" ? attempt.error : attempt.status === "NOT_CONFIGURED" ? attempt.reason : null,
    created_by: actor.userId,
    created_at: now,
    updated_at: now,
  };
  const { error } = await supabase.from(T_EXTRACTIONS).insert(row);
  if (error && !isMissingRelation(error)) raiseDbError(error, "Record document extraction failed");
  return {
    status: attempt.status,
    provider: attempt.status === "NOT_CONFIGURED" ? null : attempt.provider,
    reason: attempt.status === "NOT_CONFIGURED" ? attempt.reason : attempt.status === "FAILED" ? attempt.error : null,
  };
}

/**
 * Receive one message from a provider webhook. The company is resolved from
 * the receiving address only.
 */
export async function receiveConnectorMessage(supabase: SupabaseClient, message: ConnectorMessage, actor: OrderEngineActor): Promise<ConnectorResult> {
  const deliveredTo = normalizeEmail(message.deliveredTo);
  if (!deliveredTo.includes("@")) throw new OrderEngineError("INVALID_INPUT", "The message must state the address it was delivered to.");
  const resolved = await resolveMailboxByAddress(supabase, deliveredTo);
  if (!resolved) {
    // Nothing is stored: without a mailbox there is no tenant to store it under.
    return { status: "NO_MAILBOX", reason: `No active mailbox is configured for ${deliveredTo}; the message was not processed.` };
  }
  const { mailbox, companyId } = resolved;

  // A configured mailbox is not an activated channel. Until the e-mail channel
  // is ACTIVE, nothing is processed and nothing is stored under the tenant.
  try {
    await assertChannelActive(supabase, companyId, "email");
  } catch (error) {
    const reason = error instanceof OrderEngineError ? error.message : "The e-mail channel is not active.";
    await recordChannelActivity(supabase, companyId, { channelType: "email", ok: false, reason });
    return { status: "CHANNEL_NOT_ACTIVE", companyId, mailboxId: mailbox.id, reason };
  }

  const judgement = judgeInboundEmail(message, mailbox, { knownAttachmentHashes: await knownAttachmentHashes(supabase, companyId) });
  if (!judgement.accept) {
    const messageRowId = await quarantine(supabase, companyId, mailbox, message, judgement);
    await recordChannelActivity(supabase, companyId, { channelType: "email", ok: false, reason: judgement.summary });
    return { status: "QUARANTINED", companyId, mailboxId: mailbox.id, messageRowId, judgement };
  }

  const result = await receiveInboundEmail(supabase, companyId, message, actor, { mailboxId: mailbox.id, verification: judgement.verification });
  await recordChannelActivity(supabase, companyId, {
    channelType: "email",
    ok: result.status !== "FAILED",
    reason: result.status === "FAILED" ? result.reason || "Intake failed" : null,
    intakeId: result.orders[0]?.intake?.id ?? null,
  });

  // A held PDF gets an extraction attempt on the record, so "why is this not an
  // order?" is answerable: no extractor configured, or the provider failed.
  if (result.status === "NEEDS_EXTRACTION") {
    const settings = await loadOrderSettings(supabase, companyId);
    for (const attachment of message.attachments.filter(isPdfAttachment)) {
      await recordDocumentExtraction(
        supabase,
        companyId,
        {
          messageRowId: result.messageRowId,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          sizeBytes: Number(attachment.sizeBytes || 0),
          sha256: attachmentHash(attachment),
          extractorId: settings.pdfExtractor,
        },
        actor
      );
    }
  }
  return { status: "ACCEPTED", companyId, mailboxId: mailbox.id, result, judgement };
}
