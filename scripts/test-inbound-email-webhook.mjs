#!/usr/bin/env node
/**
 * Inbound order e-mail webhook (pure): HMAC signature + replay window, Postmark Basic auth,
 * payload normalisation (delivered-to address, attachments, sender verification).
 *   npm run test:inbound-email-webhook
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const m = await import(pathToFileURL(path.join(ROOT, "src/lib/order-engine/inbound-webhook.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const secret = "whsec_test_only";
const now = 1_763_000_000;
const body = JSON.stringify({ deliveredTo: "orders@client.test", messageId: "<abc@mail>", from: "buyer@shop.test", subject: "PO 55" });
const ts = String(now);
const sig = `sha256=${m.signGenericPayload(secret, ts, body)}`;

console.log("generic signature");
check("valid signature accepted", m.verifyGenericSignature({ rawBody: body, timestamp: ts, signature: sig, secret, nowSeconds: now + 10 }).ok);
check("body changed → rejected", !m.verifyGenericSignature({ rawBody: body.replace("PO 55", "PO 56"), timestamp: ts, signature: sig, secret, nowSeconds: now }).ok);
check("replay after 5 minutes → rejected", !m.verifyGenericSignature({ rawBody: body, timestamp: ts, signature: sig, secret, nowSeconds: now + 301 }).ok);
check("wrong secret → rejected", !m.verifyGenericSignature({ rawBody: body, timestamp: ts, signature: `sha256=${m.signGenericPayload("other", ts, body)}`, secret, nowSeconds: now }).ok);
check("missing signature → rejected", !m.verifyGenericSignature({ rawBody: body, timestamp: ts, signature: null, secret, nowSeconds: now }).ok);
check("no secret configured → rejected", !m.verifyGenericSignature({ rawBody: body, timestamp: ts, signature: sig, secret: "", nowSeconds: now }).ok);

console.log("postmark basic auth");
const basic = (u, p) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;
check("secret as password accepted", m.verifyBasicAuthSecret(basic("postmark", secret), secret));
check("wrong password rejected", !m.verifyBasicAuthSecret(basic("postmark", "nope"), secret));
check("no header rejected", !m.verifyBasicAuthSecret(null, secret));

console.log("generic payload");
const csv = Buffer.from("sku,qty\nFG-1,4\n").toString("base64");
const g = m.normalizeGenericPayload({ deliveredTo: "orders@client.test", messageId: "<abc@mail>", from: "buyer@shop.test", attachments: [{ fileName: "order.csv", contentType: "text/csv", contentBase64: csv }, { fileName: "po.pdf", contentType: "application/pdf", contentBase64: "JVBERi0=" }], verification: { spf: "pass", dkim: "PASS", dmarc: "weird" } });
check("delivered-to kept for tenant resolution", g.deliveredTo === "orders@client.test");
check("CSV attachment decoded to text", g.attachments[0].text === "sku,qty\nFG-1,4\n" && g.attachments[0].contentBase64 === null);
check("PDF kept as bytes for extraction", g.attachments[1].contentBase64 === "JVBERi0=" && g.attachments[1].text === null);
check("sender verification normalised; unknown verdict dropped", g.verification.spf === "pass" && g.verification.dkim === "pass" && g.verification.dmarc === null);
check("missing messageId refused", throws(() => m.normalizeGenericPayload({ deliveredTo: "a@b.c", from: "x@y.z" })));

console.log("postmark payload");
const p = m.normalizePostmarkPayload({
  From: "Buyer <buyer@shop.test>",
  FromFull: { Email: "buyer@shop.test" },
  To: "orders@client.test",
  ToFull: [{ Email: "alias@client.test" }],
  OriginalRecipient: "orders@client.test",
  Subject: "Order",
  MessageID: "pm-123",
  Date: "Tue, 10 Nov 2026 09:00:00 +0200",
  TextBody: "See attached",
  Headers: [
    { Name: "Message-ID", Value: "<real@shop.test>" },
    { Name: "Received-SPF", Value: "Pass (sender SPF authorized) ..." },
    { Name: "Authentication-Results", Value: "mx.postmark; dkim=pass header.d=shop.test; dmarc=fail" },
  ],
  Attachments: [{ Name: "order.xlsx", ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Content: "UEsDBA==", ContentLength: 4 }],
});
check("OriginalRecipient decides delivered-to", p.deliveredTo === "orders@client.test");
check("RFC Message-ID header used for idempotency", p.messageId === "<real@shop.test>");
check("SPF/DKIM/DMARC from Postmark headers", p.verification.spf === "pass" && p.verification.dkim === "pass" && p.verification.dmarc === "fail");
check("Excel attachment kept as bytes", p.attachments[0].contentBase64 === "UEsDBA==" && p.attachments[0].sizeBytes === 4);
check("received date parsed", p.receivedAt === "2026-11-10T07:00:00.000Z", p.receivedAt);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
