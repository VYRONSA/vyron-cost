type SendPoEmailInput = {
  purchaseOrderId: string;
  poNumber: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  htmlBody: string;
  pdfFileName: string;
  pdfBytes: Uint8Array;
};

type SendPoEmailResult = {
  status: "sent" | "failed";
  provider: "webhook" | "none";
  messageId: string | null;
  error: string | null;
  rawResponse?: string | null;
};

function toBase64(data: Uint8Array) {
  return Buffer.from(data).toString("base64");
}

export async function sendPurchaseOrderEmail(input: SendPoEmailInput): Promise<SendPoEmailResult> {
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
    type: "purchase_order",
    purchaseOrderId: input.purchaseOrderId,
    poNumber: input.poNumber,
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
