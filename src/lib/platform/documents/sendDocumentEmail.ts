export type SendDocumentEmailInput = {
  documentType: string;
  documentId: string;
  documentNumber: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  htmlBody: string;
  pdfFileName: string;
  pdfBytes: Uint8Array;
};

export type SendDocumentEmailResult = {
  status: "sent" | "failed";
  provider: "webhook" | "none";
  messageId: string | null;
  error: string | null;
  rawResponse?: string | null;
};

function toBase64(data: Uint8Array) {
  return Buffer.from(data).toString("base64");
}

/** Shared email transport for every VYRON platform document PDF (PO, GRN, invoice, sales order, etc.). */
export async function sendDocumentEmail(input: SendDocumentEmailInput): Promise<SendDocumentEmailResult> {
  const webhook = String(process.env.VYRON_EMAIL_WEBHOOK_URL || "").trim();
  if (!webhook) {
    return {
      status: "failed",
      provider: "none",
      messageId: null,
      error: "VYRON_EMAIL_WEBHOOK_URL is not configured.",
    };
  }

  const payload = {
    type: input.documentType,
    documentId: input.documentId,
    documentNumber: input.documentNumber,
    to: input.to,
    cc: input.cc || [],
    bcc: input.bcc || [],
    subject: input.subject,
    text: input.textBody,
    html: input.htmlBody,
    attachments: [
      {
        filename: input.pdfFileName,
        mimeType: "application/pdf",
        contentBase64: toBase64(input.pdfBytes),
      },
    ],
  };

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const rawResponse = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = rawResponse ? (JSON.parse(rawResponse) as Record<string, unknown>) : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      return {
        status: "failed",
        provider: "webhook",
        messageId: null,
        error: `Webhook failed (${response.status}).`,
        rawResponse,
      };
    }

    return {
      status: "sent",
      provider: "webhook",
      messageId: parsed.messageId ? String(parsed.messageId) : null,
      error: null,
      rawResponse,
    };
  } catch (error) {
    return {
      status: "failed",
      provider: "webhook",
      messageId: null,
      error: error instanceof Error ? error.message : "Unknown email transport error.",
    };
  }
}
