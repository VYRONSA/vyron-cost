import { createHash } from "crypto";
import { normalizeEmail } from "@/lib/order-engine/normalize";
import type { MailboxRow } from "@/lib/order-engine/mailboxes";
import type { InboundEmailAttachment, InboundEmailMessage } from "@/lib/order-engine/adapters/email";

/**
 * Inbound e-mail acceptance.
 *
 * Decides whether a message may be turned into orders at all. Nothing is
 * accepted "because it looks like an order": a message from an unexpected
 * sender, with an unsupported or oversized attachment, or one the provider
 * could not authenticate, is held for a person in the Exception Centre.
 *
 * Sender authentication (SPF / DKIM / DMARC) is only ever reported when the
 * PROVIDER supplies the result. VOLORA performs no verification of its own and
 * never claims a pass it was not given.
 */

export const DEFAULT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const SUPPORTED_ATTACHMENT_TYPES = [
  "text/csv",
  "application/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/pdf",
] as const;

/** What the mailbox provider says about the sender. Absent = not stated. */
export type SenderVerification = {
  spf?: "pass" | "fail" | "softfail" | "neutral" | "none" | null;
  dkim?: "pass" | "fail" | "none" | null;
  dmarc?: "pass" | "fail" | "none" | null;
  /** The provider's own summary, when it gives one. */
  provider?: string | null;
};

export type AttachmentJudgement = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string | null;
  accepted: boolean;
  reason: string | null;
  duplicateOf: string | null;
};

export type EmailJudgement = {
  accept: boolean;
  /** Short codes for the Exception Centre. */
  reasons: string[];
  /** One sentence for a person. */
  summary: string | null;
  attachments: AttachmentJudgement[];
  verification: SenderVerification & { stated: boolean; passed: boolean | null };
};

export function attachmentHash(attachment: InboundEmailAttachment): string | null {
  if (attachment.sha256) return String(attachment.sha256).toLowerCase();
  if (typeof attachment.contentBase64 === "string" && attachment.contentBase64) {
    return createHash("sha256").update(Buffer.from(attachment.contentBase64, "base64")).digest("hex");
  }
  if (typeof attachment.text === "string") return createHash("sha256").update(attachment.text).digest("hex");
  return null;
}

function senderAllowed(mailbox: MailboxRow, from: string): boolean {
  const sender = normalizeEmail(from);
  const domain = sender.split("@")[1] || "";
  const senders = mailbox.allowed_senders || [];
  const domains = mailbox.allowed_sender_domains || [];
  if (!senders.length && !domains.length) return false; // no policy decided yet
  if (senders.includes(sender)) return true;
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Judge one message against its mailbox. `knownAttachmentHashes` are hashes
 * already received for this company, so the same attachment is not processed
 * twice under a new message id.
 */
export function judgeInboundEmail(
  message: InboundEmailMessage & { verification?: SenderVerification | null },
  mailbox: MailboxRow,
  options: { knownAttachmentHashes?: Map<string, string> } = {}
): EmailJudgement {
  const reasons: string[] = [];
  const verificationInput = message.verification || {};
  const stated = Object.values(verificationInput).some((v) => v !== null && v !== undefined);
  const results = [verificationInput.spf, verificationInput.dkim, verificationInput.dmarc].filter((v): v is NonNullable<typeof v> => Boolean(v));
  const passed = stated ? (results.length ? results.every((r) => r === "pass") : null) : null;

  if (!senderAllowed(mailbox, message.from)) {
    reasons.push(
      (mailbox.allowed_senders || []).length || (mailbox.allowed_sender_domains || []).length ? "SENDER_NOT_ALLOWED" : "SENDER_POLICY_NOT_SET"
    );
  }
  if (mailbox.require_verified_sender) {
    if (!stated) reasons.push("SENDER_VERIFICATION_NOT_SUPPLIED");
    else if (passed !== true) reasons.push("SENDER_VERIFICATION_FAILED");
  }

  const maxBytes = mailbox.max_attachment_bytes ?? DEFAULT_MAX_ATTACHMENT_BYTES;
  const allowedTypes = (mailbox.allowed_mime_types || SUPPORTED_ATTACHMENT_TYPES).map((t) => t.toLowerCase());
  const seen = new Map<string, string>(options.knownAttachmentHashes || []);
  const attachments: AttachmentJudgement[] = (message.attachments || []).map((attachment) => {
    const sha = attachmentHash(attachment);
    const type = String(attachment.contentType || "").toLowerCase();
    const name = String(attachment.fileName || "attachment");
    let reason: string | null = null;
    let duplicateOf: string | null = null;
    if (Number(attachment.sizeBytes || 0) > maxBytes) reason = `Larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`;
    else if (!allowedTypes.includes(type)) reason = `Attachment type ${type || "unknown"} is not accepted.`;
    else if (sha && seen.has(sha)) {
      duplicateOf = seen.get(sha)!;
      reason = `The same file was already received (${duplicateOf}).`;
    }
    if (sha && !seen.has(sha)) seen.set(sha, name);
    return { fileName: name, contentType: type, sizeBytes: Number(attachment.sizeBytes || 0), sha256: sha, accepted: !reason, reason, duplicateOf };
  });

  const rejected = attachments.filter((a) => !a.accepted);
  if (rejected.some((a) => a.duplicateOf)) reasons.push("DUPLICATE_ATTACHMENT");
  if (rejected.some((a) => !a.duplicateOf)) reasons.push("ATTACHMENT_NOT_ACCEPTED");

  const summary = reasons.length
    ? [
        reasons.includes("SENDER_POLICY_NOT_SET") ? `No sender policy is set for ${mailbox.receiving_address}; every message is held for a person.` : null,
        reasons.includes("SENDER_NOT_ALLOWED") ? `${normalizeEmail(message.from)} is not an expected sender for ${mailbox.receiving_address}.` : null,
        reasons.includes("SENDER_VERIFICATION_NOT_SUPPLIED") ? "The provider supplied no sender verification (SPF/DKIM/DMARC) and this mailbox requires it." : null,
        reasons.includes("SENDER_VERIFICATION_FAILED") ? "The provider's sender verification did not pass." : null,
        ...rejected.map((a) => `${a.fileName}: ${a.reason}`),
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  return {
    accept: reasons.length === 0,
    reasons,
    summary,
    attachments,
    verification: { ...verificationInput, stated, passed },
  };
}
