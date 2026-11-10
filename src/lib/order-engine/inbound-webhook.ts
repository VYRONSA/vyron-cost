import { createHmac, timingSafeEqual } from "node:crypto";
import type { ConnectorMessage } from "@/lib/order-engine/connectors/email-connector";
import type { InboundEmailAttachment } from "@/lib/order-engine/adapters/email";
import type { SenderVerification } from "@/lib/order-engine/email-security";

/**
 * Inbound e-mail webhook — authentication and payload normalisation (stage 4 of
 * docs/order-engine/FOOD_SOCK_ACTIVATION_RUNBOOK.md).
 *
 * Two ways a mail provider can deliver, both authenticated with VYRON_MAIL_WEBHOOK_SECRET:
 *  - "generic": a JSON message (shape below) signed as
 *      X-Volora-Timestamp: <unix seconds>
 *      X-Volora-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 *    accepted within 5 minutes of the timestamp (replays outside the window are refused).
 *  - "postmark": Postmark's inbound JSON, with the secret as the HTTP Basic password in the
 *    webhook URL Postmark calls.
 * The tenant is NEVER taken from here: the connector resolves it from the delivered-to address.
 */

export const SIGNATURE_WINDOW_SECONDS = 300;
const MAX_ATTACHMENTS = 20;

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function signGenericPayload(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyGenericSignature(input: { rawBody: string; timestamp: string | null; signature: string | null; secret: string; nowSeconds: number }): { ok: true } | { ok: false; reason: string } {
  if (!input.secret) return { ok: false, reason: "not configured" };
  if (!input.timestamp || !/^\d{9,11}$/.test(input.timestamp)) return { ok: false, reason: "missing timestamp" };
  if (Math.abs(input.nowSeconds - Number(input.timestamp)) > SIGNATURE_WINDOW_SECONDS) return { ok: false, reason: "timestamp outside the allowed window" };
  const given = String(input.signature || "").replace(/^sha256=/i, "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return { ok: false, reason: "missing signature" };
  return safeEqual(given, signGenericPayload(input.secret, input.timestamp, input.rawBody)) ? { ok: true } : { ok: false, reason: "bad signature" };
}

export function verifyBasicAuthSecret(authorization: string | null, secret: string): boolean {
  if (!secret || !authorization || !/^Basic\s+/i.test(authorization)) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(authorization.replace(/^Basic\s+/i, ""), "base64").toString("utf8");
  } catch {
    return false;
  }
  const password = decoded.includes(":") ? decoded.slice(decoded.indexOf(":") + 1) : "";
  return safeEqual(password, secret);
}

const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const isCsv = (name: string, type: string) => /\.csv$/i.test(name) || /text\/csv/i.test(type);

function attachmentFrom(name: string, type: string, base64: string, size: number): InboundEmailAttachment {
  const fileName = name.slice(0, 255) || "attachment";
  const contentType = type.slice(0, 120) || "application/octet-stream";
  const bytes = base64 ? Buffer.from(base64, "base64") : Buffer.alloc(0);
  return {
    fileName,
    contentType,
    sizeBytes: size > 0 ? size : bytes.length,
    // CSV is read as text by the e-mail adapter; Excel and PDF stay as bytes for the boundary to convert or hold.
    text: isCsv(fileName, contentType) ? bytes.toString("utf8") : null,
    contentBase64: isCsv(fileName, contentType) ? null : base64 || null,
  };
}

const verdict = (v: unknown) => {
  const s = str(v).trim().toLowerCase();
  return ["pass", "fail", "softfail", "neutral", "none"].includes(s) ? s : null;
};

/** The generic (VOLORA) payload → connector message. Throws on a missing required field. */
export function normalizeGenericPayload(body: Record<string, unknown>): ConnectorMessage {
  const deliveredTo = str(body.deliveredTo).trim();
  const messageId = str(body.messageId).trim();
  const from = str(body.from).trim();
  if (!deliveredTo || !messageId || !from) throw new Error("deliveredTo, messageId and from are required.");
  const attachments = (Array.isArray(body.attachments) ? body.attachments : []).slice(0, MAX_ATTACHMENTS).map((a) => {
    const r = (a || {}) as Record<string, unknown>;
    return attachmentFrom(str(r.fileName), str(r.contentType), str(r.contentBase64), Number(r.sizeBytes) || 0);
  });
  const v = (body.verification || {}) as Record<string, unknown>;
  return {
    deliveredTo,
    messageId,
    provider: str(body.provider).slice(0, 60) || "generic",
    from,
    to: (Array.isArray(body.to) ? body.to : [deliveredTo]).map(str).filter(Boolean).slice(0, 50),
    cc: (Array.isArray(body.cc) ? body.cc : []).map(str).filter(Boolean).slice(0, 50),
    subject: str(body.subject).slice(0, 500) || null,
    receivedAt: str(body.receivedAt) || new Date().toISOString(),
    bodyText: str(body.text).slice(0, 200_000) || null,
    attachments,
    verification: { spf: verdict(v.spf), dkim: verdict(v.dkim), dmarc: verdict(v.dmarc), provider: str(body.provider) || null } as SenderVerification,
  };
}

/** Postmark inbound JSON → connector message. Sender checks come from Postmark's own headers. */
export function normalizePostmarkPayload(body: Record<string, unknown>): ConnectorMessage {
  const headers = (Array.isArray(body.Headers) ? body.Headers : []) as Array<{ Name?: string; Value?: string }>;
  const header = (name: string) => headers.find((h) => str(h.Name).toLowerCase() === name.toLowerCase())?.Value || "";
  const auth = header("Authentication-Results").toLowerCase();
  const pick = (key: string) => {
    const m = new RegExp(`${key}=(pass|fail|softfail|neutral|none)`).exec(auth);
    return m ? m[1] : null;
  };
  const spfHeader = header("Received-SPF").trim().split(/\s+/)[0]?.toLowerCase();
  const fromFull = (body.FromFull || {}) as Record<string, unknown>;
  const toFull = (Array.isArray(body.ToFull) ? body.ToFull : []) as Array<Record<string, unknown>>;
  const deliveredTo = str(body.OriginalRecipient).trim() || str(toFull[0]?.Email).trim() || str(body.To).split(",")[0].trim();
  const messageId = header("Message-ID").trim() || str(body.MessageID).trim();
  const from = str(fromFull.Email).trim() || str(body.From).trim();
  if (!deliveredTo || !messageId || !from) throw new Error("Postmark payload is missing the recipient, message id or sender.");
  const attachments = (Array.isArray(body.Attachments) ? body.Attachments : []).slice(0, MAX_ATTACHMENTS).map((a) => {
    const r = (a || {}) as Record<string, unknown>;
    return attachmentFrom(str(r.Name), str(r.ContentType), str(r.Content), Number(r.ContentLength) || 0);
  });
  return {
    deliveredTo,
    messageId,
    provider: "postmark",
    from,
    to: toFull.map((t) => str(t.Email)).filter(Boolean).slice(0, 50),
    cc: ((Array.isArray(body.CcFull) ? body.CcFull : []) as Array<Record<string, unknown>>).map((t) => str(t.Email)).filter(Boolean).slice(0, 50),
    subject: str(body.Subject).slice(0, 500) || null,
    receivedAt: str(body.Date) ? new Date(str(body.Date)).toISOString() : new Date().toISOString(),
    bodyText: str(body.TextBody).slice(0, 200_000) || null,
    attachments,
    verification: { spf: verdict(spfHeader) ?? pick("spf"), dkim: pick("dkim"), dmarc: pick("dmarc"), provider: "postmark" } as SenderVerification,
  };
}
