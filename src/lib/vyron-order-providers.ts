/**
 * VYRON ORDER — real notification providers.
 *
 * Three adapters behind one shape, so the notification engine never knows which
 * vendor it is talking to. Each returns the same normalised result and each is
 * honest about what actually happened:
 *
 *   Not Configured — credentials absent. Nothing was attempted.
 *   Failed         — the provider was reached and refused, or was unreachable.
 *   Sent           — the provider ACCEPTED the message.
 *
 * "Sent" is deliberately not "Delivered". Every one of these APIs returns
 * acceptance, not receipt: Resend has queued it, Twilio has accepted it. Actual
 * delivery is only known later via a provider callback, which is why Delivered
 * exists as a separate status that nothing here ever sets.
 *
 * Called from server code only. Credentials are read from process.env inside
 * these functions and never returned, logged or included in a delivery record.
 *
 * Deliberately no vendor SDKs. Both providers expose a plain REST API, and two
 * fetch calls are less to carry — and less to audit — than two dependencies.
 */

export type ProviderResult = {
  status: "Sent" | "Failed" | "Not Configured";
  provider: string;
  reference: string | null;
  error: string | null;
};

const notConfigured = (provider: string, missing: string[]): ProviderResult => ({
  status: "Not Configured",
  provider,
  reference: null,
  error: `Not configured: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set.`,
});

const env = (key: string) => String(process.env[key] || "").trim();

/** Which of the required variables are missing, for an honest status message. */
function missingVars(keys: string[]) {
  return keys.filter((k) => !env(k));
}

/* ------------------------------------------------------------------- email */

export const EMAIL_VARS = ["RESEND_API_KEY", "VYRON_EMAIL_FROM"] as const;

export function emailProviderConfigured() {
  return missingVars([...EMAIL_VARS]).length === 0;
}

/**
 * Transactional email through Resend.
 *
 * VYRON_EMAIL_REPLY_TO is optional — without it a reply goes to the from
 * address, which is a reasonable default rather than a failure.
 */
export async function sendProviderEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<ProviderResult> {
  const missing = missingVars([...EMAIL_VARS]);
  if (missing.length) return notConfigured("resend", missing);

  const replyTo = env("VYRON_EMAIL_REPLY_TO");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env("VYRON_EMAIL_FROM"),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
      }),
    });

    const raw = await response.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}; } catch { parsed = {}; }

    if (!response.ok) {
      // Resend's own message, never the key that produced it.
      const detail = typeof parsed.message === "string" ? parsed.message : `HTTP ${response.status}`;
      return { status: "Failed", provider: "resend", reference: null, error: `Resend rejected the message: ${detail}` };
    }
    return {
      status: "Sent",
      provider: "resend",
      reference: parsed.id ? String(parsed.id) : null,
      error: null,
    };
  } catch (error) {
    return {
      status: "Failed",
      provider: "resend",
      reference: null,
      error: error instanceof Error ? `Could not reach Resend: ${error.message}` : "Could not reach Resend.",
    };
  }
}

/* --------------------------------------------------------------------- sms */

export const SMS_VARS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"] as const;
export const WHATSAPP_VARS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"] as const;

export function smsProviderConfigured() {
  return missingVars([...SMS_VARS]).length === 0;
}
export function whatsappProviderConfigured() {
  return missingVars([...WHATSAPP_VARS]).length === 0;
}

/**
 * Normalise a South African mobile number to E.164.
 *
 * Accepts the forms people actually type — 082 123 4567, 082-123-4567,
 * 0027…, +27… — and returns +27821234567. Returns null when the input cannot
 * be trusted, because sending to a half-parsed number is worse than not
 * sending: it could reach a stranger.
 *
 * defaultCountry allows other tenants later without rewriting this.
 */
export function toE164(raw: string | null | undefined, defaultCountry = "27"): string | null {
  const input = String(raw || "").trim();
  if (!input) return null;
  if (/[a-zA-Z]/.test(input)) return null;

  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = "+" + digits.slice(1).replace(/\D/g, "");
    return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
  }
  digits = digits.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = defaultCountry + digits.slice(1);
  else if (!digits.startsWith(defaultCountry)) digits = defaultCountry + digits;

  const e164 = `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** Shared Twilio message send. SMS and WhatsApp differ only in the addresses. */
async function twilioSend(
  channel: "sms" | "whatsapp",
  from: string,
  to: string,
  body: string
): Promise<ProviderResult> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const provider = channel === "sms" ? "twilio-sms" : "twilio-whatsapp";

  try {
    const form = new URLSearchParams({ From: from, To: to, Body: body });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        // Basic auth over TLS, the scheme Twilio's REST API uses.
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const raw = await response.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}; } catch { parsed = {}; }

    if (!response.ok) {
      const detail = typeof parsed.message === "string" ? parsed.message : `HTTP ${response.status}`;
      const code = parsed.code ? ` (code ${String(parsed.code)})` : "";
      return { status: "Failed", provider, reference: null, error: `Twilio rejected the message: ${detail}${code}` };
    }

    /*
     * Twilio can return 2xx with a failed status. queued/accepted/sending/sent
     * all mean accepted for delivery; anything else is a refusal we should not
     * dress up as success.
     */
    const twilioStatus = String(parsed.status || "");
    if (["failed", "undelivered", "canceled"].includes(twilioStatus)) {
      return {
        status: "Failed",
        provider,
        reference: parsed.sid ? String(parsed.sid) : null,
        error: `Twilio returned status "${twilioStatus}".`,
      };
    }

    return {
      status: "Sent",
      provider,
      reference: parsed.sid ? String(parsed.sid) : null,
      error: null,
    };
  } catch (error) {
    return {
      status: "Failed",
      provider,
      reference: null,
      error: error instanceof Error ? `Could not reach Twilio: ${error.message}` : "Could not reach Twilio.",
    };
  }
}

export async function sendProviderSms(input: { to: string; body: string }): Promise<ProviderResult> {
  const missing = missingVars([...SMS_VARS]);
  if (missing.length) return notConfigured("twilio-sms", missing);

  const to = toE164(input.to);
  if (!to) {
    return {
      status: "Failed",
      provider: "twilio-sms",
      reference: null,
      error: "That mobile number could not be read as a valid international number.",
    };
  }
  const from = toE164(env("TWILIO_FROM_NUMBER")) || env("TWILIO_FROM_NUMBER");
  return twilioSend("sms", from, to, input.body);
}

/* ---------------------------------------------------------------- whatsapp */

/**
 * WhatsApp through Twilio's Business API.
 *
 * Deliberately NOT wa.me. A wa.me link opens a chat on someone's phone for a
 * human to send by hand — it notifies nobody and cannot be automated. This is
 * the real business channel: an authenticated API call from a registered
 * WhatsApp sender.
 *
 * Outside the 24-hour customer service window WhatsApp requires an approved
 * template, so the message is sent as a template when a content SID is
 * configured, and as a plain body when it is not. Twilio's own refusal is
 * surfaced verbatim rather than hidden, because "template not approved" is
 * exactly what an operator needs to read.
 */
export async function sendProviderWhatsApp(input: {
  to: string;
  body: string;
  templateVariables?: Record<string, string>;
}): Promise<ProviderResult> {
  const missing = missingVars([...WHATSAPP_VARS]);
  if (missing.length) return notConfigured("twilio-whatsapp", missing);

  const to = toE164(input.to);
  if (!to) {
    return {
      status: "Failed",
      provider: "twilio-whatsapp",
      reference: null,
      error: "That mobile number could not be read as a valid international number.",
    };
  }

  const rawFrom = env("TWILIO_WHATSAPP_FROM");
  const from = rawFrom.startsWith("whatsapp:") ? rawFrom : `whatsapp:${toE164(rawFrom) || rawFrom}`;
  const contentSid = env("TWILIO_WHATSAPP_TEMPLATE_SID");

  if (!contentSid) {
    return twilioSend("whatsapp", from, `whatsapp:${to}`, input.body);
  }

  // Approved-template send.
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  try {
    const form = new URLSearchParams({
      From: from,
      To: `whatsapp:${to}`,
      ContentSid: contentSid,
      ContentVariables: JSON.stringify(input.templateVariables || {}),
    });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const raw = await response.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}; } catch { parsed = {}; }

    if (!response.ok) {
      const detail = typeof parsed.message === "string" ? parsed.message : `HTTP ${response.status}`;
      return { status: "Failed", provider: "twilio-whatsapp", reference: null, error: `Twilio rejected the template message: ${detail}` };
    }
    return { status: "Sent", provider: "twilio-whatsapp", reference: parsed.sid ? String(parsed.sid) : null, error: null };
  } catch (error) {
    return {
      status: "Failed",
      provider: "twilio-whatsapp",
      reference: null,
      error: error instanceof Error ? `Could not reach Twilio: ${error.message}` : "Could not reach Twilio.",
    };
  }
}

/* ------------------------------------------------------------------ status */

export type ProviderStatus = {
  configured: boolean;
  provider: string | null;
  missing: string[];
  detail: string;
};

/**
 * What each channel can actually do right now.
 *
 * Reports the missing variable names — which are not secrets — so an operator
 * can see exactly what to set without anyone reading a value back.
 */
export function providerStatuses(): Record<"inApp" | "email" | "sms" | "whatsapp", ProviderStatus> {
  const emailMissing = missingVars([...EMAIL_VARS]);
  const smsMissing = missingVars([...SMS_VARS]);
  const whatsappMissing = missingVars([...WHATSAPP_VARS]);
  const legacyWebhook = env("VYRON_EMAIL_WEBHOOK_URL");

  return {
    inApp: {
      configured: true,
      provider: "VYRON",
      missing: [],
      detail: "Always available. Needs no provider and no credentials.",
    },
    email: emailMissing.length === 0
      ? { configured: true, provider: "Resend", missing: [], detail: `Sending from ${env("VYRON_EMAIL_FROM")}.` }
      : legacyWebhook
        ? { configured: true, provider: "Webhook", missing: [], detail: "Using the legacy VYRON email webhook. Set RESEND_API_KEY to move to Resend." }
        : { configured: false, provider: null, missing: emailMissing, detail: `Not configured. Set ${emailMissing.join(" and ")}.` },
    sms: smsMissing.length === 0
      ? { configured: true, provider: "Twilio", missing: [], detail: `Sending from ${env("TWILIO_FROM_NUMBER")}.` }
      : { configured: false, provider: null, missing: smsMissing, detail: `Not configured. Set ${smsMissing.join(", ")}.` },
    whatsapp: whatsappMissing.length === 0
      ? {
          configured: true,
          provider: "Twilio WhatsApp",
          missing: [],
          detail: env("TWILIO_WHATSAPP_TEMPLATE_SID")
            ? `Sending from ${env("TWILIO_WHATSAPP_FROM")} using an approved template.`
            : `Sending from ${env("TWILIO_WHATSAPP_FROM")}. No template configured — messages outside the 24-hour window will be refused by WhatsApp.`,
        }
      : { configured: false, provider: null, missing: whatsappMissing, detail: `Not configured. Set ${whatsappMissing.join(", ")}.` },
  };
}
