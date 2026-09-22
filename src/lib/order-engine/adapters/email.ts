import { cleanText, normalizeEmail } from "@/lib/order-engine/normalize";
import type { OrderCandidate } from "@/lib/order-engine/types";
import { parseCsvOrder } from "@/lib/order-engine/adapters/csv";
import { isXlsxAttachment } from "@/lib/order-engine/adapters/xlsx";
import { OrderSourceParseError } from "@/lib/order-engine/adapters/types";

/**
 * The inbound e-mail boundary.
 *
 * NOT CONNECTED: VYRON has no inbound mailbox or provider webhook. This module
 * defines the message shape a future provider adapter must produce and the
 * deterministic rule for turning a message into order candidates. Today it is
 * driven only by tests and by trusted server code.
 *
 * Rule: every CSV attachment — and every Excel (.xlsx) attachment, read into
 * the same CSV text first (adapters/xlsx.ts) — becomes one candidate (source
 * "email", key "<message id>#<file name>"). A message whose only order
 * documents are PDFs is held as NEEDS_EXTRACTION: the document waits for an
 * extractor (extraction.ts) or a person; nothing is guessed. A message with no
 * attachment yields no candidate — the body is kept for a person.
 */

export type InboundEmailAttachment = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string | null;
  /** Text content, for text attachments the adapter can read (CSV; Excel after conversion). */
  text?: string | null;
  /** Raw bytes (base64) for binary attachments the boundary converts itself (Excel). */
  contentBase64?: string | null;
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
  | { kind: "needs_extraction"; documents: Array<{ fileName: string; contentType: string }>; reason: string }
  | { kind: "no_order"; reason: string };

export function isPdfAttachment(attachment: { fileName?: string | null; contentType?: string | null }): boolean {
  const type = String(attachment.contentType || "").toLowerCase();
  const name = String(attachment.fileName || "").toLowerCase();
  return type === "application/pdf" || name.endsWith(".pdf");
}

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
  const csvs = message.attachments.filter((a) => isCsv(a) || isXlsxAttachment(a));
  if (!csvs.length) {
    const pdfs = message.attachments.filter(isPdfAttachment);
    if (pdfs.length) {
      return {
        kind: "needs_extraction",
        documents: pdfs.map((a) => ({ fileName: a.fileName, contentType: a.contentType })),
        reason: `${pdfs.length} PDF order document(s) held for extraction — no extractor is connected; enter the order manually or process the document.`,
      };
    }
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
