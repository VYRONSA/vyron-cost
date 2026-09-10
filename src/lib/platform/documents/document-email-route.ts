import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";
import type { WorkspaceSession } from "@/lib/vyron-workspace-session";
import { sendDocumentEmail, type DocumentEmailOutcome } from "@/lib/platform/documents/sendDocumentEmail";
import {
  buildDocumentEmailContent,
  normaliseEmailAddress,
  parseCopyRecipients,
  resolveDocumentReplyTo,
  type ReplyToSource,
} from "@/lib/platform/documents/document-email-content";

/**
 * The part of every document email route that is the same for every document.
 *
 * Each route still does its own authentication, its own company resolution, its
 * own ownership check and its own audit write — those differ per document and
 * are audited per route. What lives here is the sequence after ownership is
 * proven: validate the recipient, build the content from server data, render the
 * PDF, send, and turn the result into a response a user may safely read.
 */

export type DocumentEmailRouteOutcome = DocumentEmailOutcome | "pdf_failed" | "not_found";

const GENERIC_FAILURE = "The email could not be sent. Please try again or contact your administrator.";

const USER_MESSAGES: Record<Exclude<DocumentEmailRouteOutcome, "accepted" | "invalid_recipient">, string> = {
  not_configured: "Email sending isn't configured for this workspace. Please contact your administrator.",
  timeout: "The email service did not respond in time. Please try again or contact your administrator.",
  provider_unavailable: GENERIC_FAILURE,
  provider_rejected: GENERIC_FAILURE,
  pdf_failed: "The document PDF could not be generated, so no email was sent. Please try again or contact your administrator.",
  not_found: "Document not found.",
};

const HTTP_STATUS: Record<DocumentEmailRouteOutcome, number> = {
  accepted: 200,
  invalid_recipient: 400,
  not_found: 404,
  pdf_failed: 500,
  provider_unavailable: 502,
  provider_rejected: 502,
  not_configured: 503,
  timeout: 504,
};

export type DocumentEmailDelivery = {
  outcome: DocumentEmailRouteOutcome;
  /** Safe for a user to read. Null on success. */
  userMessage: string | null;
  /** Internal detail for logs and the audit trail. Never returned to the browser. */
  internalError: string | null;
  recipient: string | null;
  cc: string[];
  bcc: string[];
  subject: string | null;
  replyToSource: ReplyToSource;
  provider: "resend" | "none";
  messageId: string | null;
  attachment: { filename: string; bytes: number; contentType: "application/pdf" } | null;
  attemptedAt: string;
};

/** True only for a real, non-empty company id equal to the verified one. NULL never passes. */
export function belongsToCompany(rowCompanyId: unknown, companyId: string): boolean {
  return typeof rowCompanyId === "string" && rowCompanyId.length > 0 && rowCompanyId === companyId;
}

/**
 * The audit actor. Taken from the verified workspace session — the member whose
 * Active membership authorised this request — and never from the request body.
 */
export function auditActorFromSession(session: WorkspaceSession): string {
  return String(session.userId || "").trim() || "unknown-member";
}

/** The request body as a plain object, or an empty one. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.json().catch(() => null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/**
 * The sending workspace's name and remittance address, read by verified company.
 * `remittance_email` is the address the tenant sets in Company Setup as "where
 * customers send proof of payment" (vyron_workspaces.remittance_email).
 */
export async function loadWorkspaceEmailIdentity(
  supabase: SupabaseClient,
  companyId: string
): Promise<{ senderName: string | null; remittanceEmail: string | null }> {
  const { data, error } = await supabase
    .from("vyron_workspaces")
    .select("company_name, trading_name, remittance_email")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return { senderName: null, remittanceEmail: null };
  const row = data as Record<string, unknown>;
  const senderName = String(row.trading_name || "").trim() || String(row.company_name || "").trim() || null;
  return { senderName, remittanceEmail: typeof row.remittance_email === "string" ? row.remittance_email : null };
}

export async function deliverDocumentEmail(params: {
  documentType: string;
  documentId: string;
  documentNumber: string;
  /** "Invoice", "Sales Order", "Purchase Order", "Goods Receipt Note". */
  documentLabel: string;
  /** The address the user typed, if any. */
  requestedTo: unknown;
  /** The address on the customer or supplier record. */
  defaultTo: unknown;
  requestedCc?: unknown;
  requestedBcc?: unknown;
  senderName: string | null;
  recipientName: string | null;
  /** Only documents where payment correspondence belongs with the tenant pass this. */
  workspaceRemittanceEmail?: string | null;
  buildPdf: () => Promise<{ bytes: Uint8Array } | null>;
}): Promise<DocumentEmailDelivery> {
  const attemptedAt = new Date().toISOString();
  const base: DocumentEmailDelivery = {
    outcome: "invalid_recipient",
    userMessage: null,
    internalError: null,
    recipient: null,
    cc: [],
    bcc: [],
    subject: null,
    replyToSource: "none",
    provider: "none",
    messageId: null,
    attachment: null,
    attemptedAt,
  };

  /* --------------------------------------------------------------- recipient */

  const typed = typeof params.requestedTo === "string" ? params.requestedTo.trim() : params.requestedTo;
  const hasTyped = typed !== undefined && typed !== null && typed !== "";
  const candidate = hasTyped ? typed : params.defaultTo;
  if (!hasTyped && !String(params.defaultTo ?? "").trim()) {
    return { ...base, userMessage: "A recipient email address is required." };
  }
  const recipient = normaliseEmailAddress(candidate);
  if (!recipient) {
    return { ...base, userMessage: "Enter a valid recipient email address." };
  }
  const cc = parseCopyRecipients(params.requestedCc);
  const bcc = parseCopyRecipients(params.requestedBcc);
  if (!cc.ok || !bcc.ok) {
    return { ...base, recipient, userMessage: "One of the CC or BCC addresses is not a valid email address." };
  }

  /* ----------------------------------------------------------------- content */

  const content = buildDocumentEmailContent({
    documentLabel: params.documentLabel,
    documentNumber: params.documentNumber,
    senderName: params.senderName,
    recipientName: params.recipientName,
  });
  const { replyTo, source: replyToSource } = resolveDocumentReplyTo({
    workspaceRemittanceEmail: params.workspaceRemittanceEmail,
    platformReplyTo: process.env.VYRON_EMAIL_REPLY_TO,
    recipient,
  });
  const prepared = { ...base, recipient, cc: cc.addresses, bcc: bcc.addresses, subject: content.subject, replyToSource };

  /* --------------------------------------------------------------------- pdf */

  let pdf: { bytes: Uint8Array } | null;
  try {
    pdf = await params.buildPdf();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[document-email] PDF generation failed", {
      documentType: params.documentType,
      documentId: params.documentId,
      detail,
    });
    return {
      ...prepared,
      outcome: "pdf_failed",
      userMessage: USER_MESSAGES.pdf_failed,
      internalError: `PDF generation failed: ${detail}`.slice(0, 500),
    };
  }
  if (!pdf) {
    return { ...prepared, outcome: "not_found", userMessage: USER_MESSAGES.not_found };
  }

  const pdfFileName = `${String(params.documentNumber).replace(/[^A-Za-z0-9._-]+/g, "-") || "document"}.pdf`;
  const attachment = { filename: pdfFileName, bytes: pdf.bytes.byteLength, contentType: "application/pdf" as const };

  /* -------------------------------------------------------------------- send */

  const result = await sendDocumentEmail({
    documentType: params.documentType,
    documentId: params.documentId,
    documentNumber: params.documentNumber,
    to: recipient,
    cc: cc.addresses,
    bcc: bcc.addresses,
    replyTo,
    subject: content.subject,
    textBody: content.text,
    htmlBody: content.html,
    pdfFileName,
    pdfBytes: pdf.bytes,
  });

  return {
    ...prepared,
    outcome: result.outcome,
    userMessage:
      result.outcome === "accepted"
        ? null
        : result.outcome === "invalid_recipient"
          ? "Enter a valid recipient email address."
          : USER_MESSAGES[result.outcome],
    internalError: result.error,
    provider: result.provider,
    messageId: result.messageId,
    attachment,
  };
}

/** Whether an attempt belongs in the audit trail. Input errors and missing documents do not. */
export function shouldAuditDelivery(delivery: DocumentEmailDelivery): boolean {
  return delivery.outcome !== "invalid_recipient" && delivery.outcome !== "not_found";
}

/**
 * Audit metadata for one attempt. "sent" means accepted by the provider for
 * delivery; delivery itself is not confirmed by anything here, and says so.
 */
export function documentEmailAuditMetadata(
  delivery: DocumentEmailDelivery,
  context: {
    companyId: string;
    documentType: string;
    documentId: string;
    documentNumber: string;
    actorUserId: string;
    extra?: Record<string, unknown>;
  }
): Record<string, unknown> {
  return {
    status: delivery.outcome === "accepted" ? "sent" : "failed",
    outcome: delivery.outcome,
    provider: delivery.provider,
    message_id: delivery.messageId,
    delivery_confirmed: false,
    recipient: delivery.recipient,
    cc: delivery.cc,
    bcc: delivery.bcc,
    subject: delivery.subject,
    reply_to_source: delivery.replyToSource,
    attachment: delivery.attachment,
    company_id: context.companyId,
    document_type: context.documentType,
    document_id: context.documentId,
    document_number: context.documentNumber,
    actor_user_id: context.actorUserId,
    sent_at: delivery.attemptedAt,
    error: delivery.internalError,
    ...(context.extra || {}),
  };
}

/** An audit write never turns an accepted email into a reported failure. */
export async function writeAuditSafely(write: () => Promise<unknown>, context: string) {
  try {
    await write();
  } catch (error) {
    console.error(`[document-email] audit write failed: ${context}`, error);
  }
}

export function documentEmailResponse(delivery: DocumentEmailDelivery, extra: Record<string, unknown> = {}) {
  const ok = delivery.outcome === "accepted";
  return NextResponse.json(
    {
      ok,
      status: ok ? "sent" : "failed",
      outcome: delivery.outcome,
      provider: delivery.provider,
      messageId: delivery.messageId,
      recipient: delivery.recipient,
      error: ok ? null : delivery.userMessage || GENERIC_FAILURE,
      ...extra,
    },
    { status: HTTP_STATUS[delivery.outcome] }
  );
}

export function documentNotFoundResponse(label: string) {
  return NextResponse.json(
    { ok: false, status: "failed", outcome: "not_found", error: `${label} not found.` },
    { status: 404 }
  );
}

export function noWorkspaceCompanyResponse() {
  return NextResponse.json({ ok: false, status: "failed", error: "No active workspace company." }, { status: 400 });
}

/** The server itself cannot do the work. The cause goes to the log, not the user. */
export function documentEmailServiceUnavailable(context: string) {
  console.error(`[document-email] ${context}`);
  return NextResponse.json({ ok: false, status: "failed", error: GENERIC_FAILURE }, { status: 503 });
}

/**
 * Authentication and permission failures keep their own status and message —
 * "Workspace session required." / "Access denied." are written for users.
 * Anything else is logged and answered generically.
 */
export function documentEmailErrorResponse(error: unknown, context: string) {
  if (error instanceof WorkspaceAccessError) {
    return NextResponse.json({ ok: false, status: "failed", error: error.message }, { status: error.status });
  }
  console.error(`[document-email] ${context} failed`, error);
  return NextResponse.json({ ok: false, status: "failed", error: GENERIC_FAILURE }, { status: 500 });
}
