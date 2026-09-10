import { sendProviderEmail } from "@/lib/vyron-order-providers";
import { normaliseEmailAddress, parseCopyRecipients } from "@/lib/platform/documents/document-email-content";

export type SendDocumentEmailInput = {
  documentType: string;
  documentId: string;
  documentNumber: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  /** Resolved by the caller from server-side workspace data. Null sends without one. */
  replyTo: string | null;
  subject: string;
  textBody: string;
  htmlBody: string;
  pdfFileName: string;
  pdfBytes: Uint8Array;
};

/**
 * What happened, in terms a route can act on. "accepted" means the provider
 * took the message for delivery — not that it arrived.
 */
export type DocumentEmailOutcome =
  | "accepted"
  | "not_configured"
  | "invalid_recipient"
  | "timeout"
  | "provider_unavailable"
  | "provider_rejected";

export type SendDocumentEmailResult = {
  status: "sent" | "failed";
  outcome: DocumentEmailOutcome;
  provider: "resend" | "none";
  messageId: string | null;
  /** Internal detail for server logs and the audit trail. Never shown to a user. */
  error: string | null;
};

function failed(outcome: DocumentEmailOutcome, provider: "resend" | "none", error: string): SendDocumentEmailResult {
  return { status: "failed", outcome, provider, messageId: null, error };
}

/**
 * Shared email transport for every VYRON platform document PDF (invoice, sales
 * order, purchase order, goods receipt).
 *
 * Sends through Resend — the provider VYRON ORDER notifications already use —
 * with the generated PDF as a real attachment. The former
 * VYRON_EMAIL_WEBHOOK_URL transport is gone: it had no receiver anywhere, and a
 * document containing a customer's invoice is not posted to an undocumented URL.
 *
 * Recipients are re-validated here even though every route validates first, so
 * no future caller can hand this an unchecked address.
 */
export async function sendDocumentEmail(input: SendDocumentEmailInput): Promise<SendDocumentEmailResult> {
  const to = normaliseEmailAddress(input.to);
  const cc = parseCopyRecipients(input.cc);
  const bcc = parseCopyRecipients(input.bcc);
  if (!to || !cc.ok || !bcc.ok) {
    return failed("invalid_recipient", "none", "A recipient address failed validation; nothing was sent.");
  }

  const result = await sendProviderEmail({
    to,
    cc: cc.addresses,
    bcc: bcc.addresses,
    replyTo: input.replyTo,
    subject: input.subject,
    text: input.textBody,
    html: input.htmlBody,
    attachments: [
      {
        filename: input.pdfFileName,
        contentBase64: Buffer.from(input.pdfBytes).toString("base64"),
        contentType: "application/pdf",
      },
    ],
  });

  if (result.status === "Sent") {
    return { status: "sent", outcome: "accepted", provider: "resend", messageId: result.reference, error: null };
  }

  const outcome: DocumentEmailOutcome =
    result.failure === "not_configured"
      ? "not_configured"
      : result.failure === "timeout"
        ? "timeout"
        : result.failure === "rejected"
          ? "provider_rejected"
          : "provider_unavailable";

  console.error("[document-email] send failed", {
    documentType: input.documentType,
    documentId: input.documentId,
    outcome,
    detail: result.error,
  });

  return failed(outcome, outcome === "not_configured" ? "none" : "resend", result.error || "Email provider failure.");
}
