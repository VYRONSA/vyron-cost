import { cleanText, normalizeEmail } from "@/lib/order-engine/normalize";
import type { OrderCandidate } from "@/lib/order-engine/types";
import { parseCsvOrder } from "@/lib/order-engine/adapters/csv";
import { OrderSourceParseError } from "@/lib/order-engine/adapters/types";

/**
 * The inbound e-mail boundary.
 *
 * NOT CONNECTED: VYRON has no inbound mailbox or provider webhook. This module
 * defines the message shape a future provider adapter must produce and the
 * deterministic rule for turning a message into order candidates. Today it is
 * driven only by tests and by trusted server code.
 *
 * Rule: every CSV attachment becomes one candidate (source "email", key
 * "<message id>#<file name>"). A message with no CSV attachment yields no
 * candidate — the body is kept for a person; it is never guessed at. PDF/XLSX
 * and AI extraction of bodies are designed for later (architecture §9–10).
 */

export type InboundEmailAttachment = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string | null;
  /** Text content, for text attachments the adapter can read (CSV). */
  text?: string | null;
  /** Where the bytes are stored, once a provider stores them (vyron-documents bucket). */
  storagePath?: string | null;
};

export type InboundEmailMessage = {
  /** The provider's stable message id (RFC 5322 Message-ID). Idempotency key. */
  messageId: string;
  provider: string;
  from: string;
  to: string[];
  cc?: string[];
  subject?: string | null;
  receivedAt: string;
  bodyText?: string | null;
  attachments: InboundEmailAttachment[];
};

export type EmailParseResult =
  | { kind: "orders"; candidates: OrderCandidate[] }
  | { kind: "no_order"; reason: string };

function isCsv(attachment: InboundEmailAttachment): boolean {
  const type = String(attachment.contentType || "").toLowerCase();
  const name = String(attachment.fileName || "").toLowerCase();
  return type === "text/csv" || type === "application/csv" || name.endsWith(".csv");
}

export function assertInboundEmail(message: InboundEmailMessage): void {
  if (!cleanText(message?.messageId)) throw new OrderSourceParseError("The message has no message id.");
  if (!normalizeEmail(message.from).includes("@")) throw new OrderSourceParseError("The message has no sender address.");
  if (!message.receivedAt || Number.isNaN(new Date(message.receivedAt).getTime())) {
    throw new OrderSourceParseError("The message has no valid received time.");
  }
  if (!Array.isArray(message.attachments)) throw new OrderSourceParseError("The message attachment list is missing.");
}

export function parseInboundEmail(message: InboundEmailMessage): EmailParseResult {
  assertInboundEmail(message);
  const csvs = message.attachments.filter(isCsv);
  if (!csvs.length) {
    return {
      kind: "no_order",
      reason: message.attachments.length
        ? "No CSV attachment. PDF, Excel and free-text orders are not read automatically yet; handle this message manually."
        : "No attachment. Free-text orders are not read automatically yet; handle this message manually.",
    };
  }
  const sender = normalizeEmail(message.from);
  const candidates = csvs.map((attachment) => {
    if (typeof attachment.text !== "string") {
      throw new OrderSourceParseError(`Attachment ${attachment.fileName} has no readable content.`);
    }
    const candidate = parseCsvOrder({
      text: attachment.text,
      fileName: attachment.fileName,
      source: "email",
      sourceKey: `${message.messageId.trim()}#${attachment.fileName}`,
      senderEmail: sender,
    });
    return {
      ...candidate,
      sourceReference: cleanText(`${message.subject || "(no subject)"} — ${attachment.fileName}`, 300),
    };
  });
  return { kind: "orders", candidates };
}
