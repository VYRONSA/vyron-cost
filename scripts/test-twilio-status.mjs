#!/usr/bin/env node
/**
 * Twilio status callbacks (pure): request-signature check, status mapping, callback URL rule.
 *   npm run test:twilio-status
 */
import { register } from "node:module";
import { createHmac } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const m = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-twilio-status.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };

const token = "test-auth-token";
const url = "https://www.example.test/api/integrations/twilio/status";
const params = { MessageSid: "SM0123456789abcdef0123456789abcdef", MessageStatus: "delivered", AccountSid: "AC1", To: "whatsapp:+27820000000" };
const sign = (u, p, t) => createHmac("sha1", t).update(Object.keys(p).sort().reduce((a, k) => a + k + p[k], u)).digest("base64");
const good = sign(url, params, token);

console.log("signature");
check("valid Twilio signature accepted", m.validTwilioSignature({ url, params, signature: good, authToken: token }));
check("tampered status rejected", !m.validTwilioSignature({ url, params: { ...params, MessageStatus: "failed" }, signature: good, authToken: token }));
check("wrong token rejected", !m.validTwilioSignature({ url, params, signature: sign(url, params, "other"), authToken: token }));
check("different URL rejected", !m.validTwilioSignature({ url: url + "?x=1", params, signature: good, authToken: token }));
check("missing signature rejected", !m.validTwilioSignature({ url, params, signature: null, authToken: token }));
check("missing auth token rejected", !m.validTwilioSignature({ url, params, signature: good, authToken: "" }));

console.log("status mapping");
check("delivered → Delivered", m.deliveryStatusFromTwilio("delivered") === "Delivered");
check("read (WhatsApp) → Delivered", m.deliveryStatusFromTwilio("read") === "Delivered");
check("undelivered / failed → Failed", m.deliveryStatusFromTwilio("undelivered") === "Failed" && m.deliveryStatusFromTwilio("failed") === "Failed");
check("queued / sent change nothing (never assumed delivered)", m.deliveryStatusFromTwilio("queued") === null && m.deliveryStatusFromTwilio("sent") === null);

console.log("callback URL");
process.env.NEXT_PUBLIC_APP_URL = "https://www.volora.co.za/";
check("https app URL → callback", m.twilioStatusCallbackUrl() === "https://www.volora.co.za/api/integrations/twilio/status");
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
check("non-https (local) → no callback requested", m.twilioStatusCallbackUrl() === null);
delete process.env.NEXT_PUBLIC_APP_URL;
check("unset → no callback", m.twilioStatusCallbackUrl() === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
