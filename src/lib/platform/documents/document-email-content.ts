/**
 * Document email — recipient validation and server-built content.
 *
 * Pure functions, no I/O. Everything that ends up in an outbound document email
 * is decided here from server-side data: the browser can choose WHO receives a
 * document it is already permitted to send, and nothing else. Subject, body,
 * sender and Reply-To are never taken from the request.
 */

/** The rule the Company Setup form already applies to contact and remittance addresses. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Characters that have no business in a plain mailbox and every business in a
 * header-injection or display-name trick: control characters (CR/LF included),
 * angle brackets, quotes, separators.
 */
const FORBIDDEN_PUNCTUATION = '<>()[],;:"' + String.fromCharCode(92);

/** Control characters, CR and LF included, and DEL. */
function isControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code < 32 || code === 127;
}

function hasForbiddenCharacter(value: string): boolean {
  for (const character of value) {
    if (isControlCharacter(character) || FORBIDDEN_PUNCTUATION.includes(character)) return true;
  }
  return false;
}

const MAX_ADDRESS_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;

/** Copy recipients per list. A document email is not a mailing list. */
export const MAX_COPY_RECIPIENTS = 10;

/**
 * A single mailbox address, trimmed — or null when it cannot be trusted.
 *
 * Deliberately not an RFC 5322 parser. It accepts the addresses people actually
 * use and refuses anything that could be read as more than one address or as a
 * header, which is the property that matters for a server that sends mail.
 */
export function normaliseEmailAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (!email || email.length > MAX_ADDRESS_LENGTH) return null;
  if (hasForbiddenCharacter(email)) return null;
  if (!EMAIL_PATTERN.test(email)) return null;

  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > MAX_LOCAL_PART_LENGTH) return null;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  if (domain.startsWith(".") || domain.startsWith("-") || domain.endsWith(".") || domain.includes("..")) return null;
  return email;
}

/**
 * A CC or BCC list from the request. Absent means none; anything present must be
 * an array whose every entry is a valid address. One bad entry refuses the whole
 * list rather than silently dropping it, so the sender never believes someone
 * was copied who was not.
 */
export function parseCopyRecipients(input: unknown): { ok: true; addresses: string[] } | { ok: false } {
  if (input === undefined || input === null) return { ok: true, addresses: [] };
  if (!Array.isArray(input)) return { ok: false };

  const addresses: string[] = [];
  for (const entry of input) {
    if (typeof entry === "string" && !entry.trim()) continue;
    const address = normaliseEmailAddress(entry);
    if (!address) return { ok: false };
    if (!addresses.some((existing) => existing.toLowerCase() === address.toLowerCase())) addresses.push(address);
  }
  if (addresses.length > MAX_COPY_RECIPIENTS) return { ok: false };
  return { ok: true, addresses };
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One line, no control characters, bounded — safe to place in a subject. */
function singleLine(value: unknown, max = 120): string {
  return String(value ?? "")
    .split("").map((character) => (isControlCharacter(character) ? " " : character)).join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export type DocumentEmailContent = { subject: string; text: string; html: string };

/**
 * Subject and body for a document email, built only from the verified document
 * and the workspace it belongs to. Every interpolated value is escaped for the
 * HTML part and flattened to one line for the subject.
 */
export function buildDocumentEmailContent(input: {
  /** "Invoice", "Sales Order", "Purchase Order", "Goods Receipt Note". */
  documentLabel: string;
  documentNumber: string;
  /** The workspace's trading or company name. */
  senderName?: string | null;
  /** The customer or supplier the document is addressed to. */
  recipientName?: string | null;
}): DocumentEmailContent {
  const label = singleLine(input.documentLabel, 40);
  const number = singleLine(input.documentNumber, 60);
  const sender = singleLine(input.senderName, 120) || null;
  const recipient = singleLine(input.recipientName, 120) || null;

  const subject = singleLine(sender ? `${label} ${number} from ${sender}` : `${label} ${number}`, 200);

  const text = [
    recipient ? `Good day ${recipient},` : "Good day,",
    "",
    `Please find attached ${label.toLowerCase()} ${number}${sender ? ` from ${sender}` : ""}.`,
    "",
    "Kind regards,",
    sender || "VOLORA",
  ].join("\n");

  const html = [
    `<p>${recipient ? `Good day ${escapeHtml(recipient)},` : "Good day,"}</p>`,
    `<p>Please find attached ${escapeHtml(label.toLowerCase())} <strong>${escapeHtml(number)}</strong>${
      sender ? ` from ${escapeHtml(sender)}` : ""
    }.</p>`,
    `<p>Kind regards,<br/>${escapeHtml(sender || "VOLORA")}</p>`,
  ].join("\n");

  return { subject, text, html };
}

export type ReplyToSource = "workspace_remittance" | "platform_default" | "none";

/**
 * Reply-To for a document email.
 *
 * The workspace's own remittance address first — it is where that tenant's
 * customers are told to send payment correspondence — then the platform default,
 * then none. An address equal to the recipient is never used: replying to your
 * own copy of an invoice should not land back in your own inbox.
 */
export function resolveDocumentReplyTo(input: {
  workspaceRemittanceEmail?: unknown;
  platformReplyTo?: unknown;
  recipient?: string | null;
}): { replyTo: string | null; source: ReplyToSource } {
  const recipient = String(input.recipient || "").toLowerCase();
  const usable = (value: unknown) => {
    const address = normaliseEmailAddress(value);
    return address && address.toLowerCase() !== recipient ? address : null;
  };

  const workspace = usable(input.workspaceRemittanceEmail);
  if (workspace) return { replyTo: workspace, source: "workspace_remittance" };
  const platform = usable(input.platformReplyTo);
  if (platform) return { replyTo: platform, source: "platform_default" };
  return { replyTo: null, source: "none" };
}
