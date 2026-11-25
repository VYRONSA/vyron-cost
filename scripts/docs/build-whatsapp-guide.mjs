#!/usr/bin/env node
/**
 * Builds docs/integrations/VYRON-COST-WhatsApp-Notifications-Setup-and-Testing-Guide.pdf
 *
 *   node scripts/docs/build-whatsapp-guide.mjs
 *
 * Every screen name, label, message and variable name in this guide is taken
 * from the application code (src/lib/vyron-order-providers.ts,
 * src/lib/vyron-order-notifications.ts, src/lib/vyron-twilio-status.ts,
 * src/components/vyron-order/OrderNotificationSettingsClient.tsx,
 * src/components/vyron-order/OrderCentreDetailClient.tsx). If any of those
 * change, update this script and rebuild. No credential appears in the guide.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "docs/integrations/VYRON-COST-WhatsApp-Notifications-Setup-and-Testing-Guide.pdf");

const doc = new jsPDF({ unit: "mm", format: "a4" });
const W = 210;
const M = 18;
const R = W - M;
const BOTTOM = 276;
const INK = [17, 24, 39];
const MUTED = [71, 85, 105];
const ACCENT = [37, 99, 235];
const NAVY = [15, 23, 42];
let y = 0;
const toc = [];

const font = (style = "normal", size = 10, color = INK) => {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
};
const need = (h) => {
  if (y + h > BOTTOM) {
    doc.addPage();
    y = 22;
  }
};
const para = (text, opts = {}) => {
  font(opts.style || "normal", opts.size || 10, opts.color || INK);
  const lines = doc.splitTextToSize(text, (opts.width || R - M) - (opts.indent || 0));
  for (const line of lines) {
    need(5.2);
    doc.text(line, M + (opts.indent || 0), y);
    y += opts.lh || 5;
  }
  y += opts.after ?? 2.5;
};
const bullets = (items, indent = 0) => {
  for (const item of items) {
    font("normal", 10);
    const lines = doc.splitTextToSize(item, R - M - 6 - indent);
    need(lines.length * 5 + 1);
    doc.text("•", M + indent + 1, y);
    lines.forEach((l, i) => doc.text(l, M + indent + 6, y + i * 5));
    y += lines.length * 5 + 1.2;
  }
  y += 1.5;
};
const steps = (items) => {
  items.forEach((item, idx) => {
    font("normal", 10);
    const lines = doc.splitTextToSize(item, R - M - 9);
    need(lines.length * 5 + 1.5);
    font("bold", 10, ACCENT);
    doc.text(`${idx + 1}.`, M + 1, y);
    font("normal", 10);
    lines.forEach((l, i) => doc.text(l, M + 8, y + i * 5));
    y += lines.length * 5 + 1.6;
  });
  y += 1.5;
};
let sectionNo = 0;
const h1 = (title) => {
  sectionNo += 1;
  need(20);
  y += 4;
  toc.push({ n: sectionNo, title, page: doc.getNumberOfPages() });
  doc.setFillColor(...ACCENT);
  doc.rect(M, y - 5.5, 1.6, 8, "F");
  font("bold", 15, NAVY);
  doc.text(`${sectionNo}. ${title}`, M + 4.5, y);
  y += 8;
};
const h2 = (title) => {
  need(12);
  y += 1;
  font("bold", 11.5, NAVY);
  doc.text(title, M, y);
  y += 6;
};
const callout = (title, text, tone = "info") => {
  const fill = tone === "warn" ? [254, 243, 199] : tone === "danger" ? [254, 226, 226] : [219, 234, 254];
  const ink = tone === "warn" ? [120, 53, 15] : tone === "danger" ? [127, 29, 29] : [30, 58, 138];
  font("normal", 9.5);
  const lines = doc.splitTextToSize(text, R - M - 8);
  const h = lines.length * 4.6 + 11;
  need(h + 2);
  doc.setFillColor(...fill);
  doc.roundedRect(M, y - 4, R - M, h, 2, 2, "F");
  font("bold", 9.5, ink);
  doc.text(title, M + 4, y + 1.5);
  font("normal", 9.5, ink);
  lines.forEach((l, i) => doc.text(l, M + 4, y + 7 + i * 4.6));
  y += h + 3;
};
const table = (head, body, widths) => {
  need(14);
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [head],
    body,
    theme: "grid",
    headStyles: { fillColor: NAVY, fontSize: 8.5, textColor: 255 },
    styles: { fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: [203, 213, 225], lineWidth: 0.2, valign: "top" },
    columnStyles: widths ? Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }])) : {},
  });
  y = doc.lastAutoTable.finalY + 5;
};
const mono = (text) => {
  font("normal", 9);
  const lines = text.split("\n");
  const h = lines.length * 4.4 + 5;
  need(h + 2);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(M, y - 3.5, R - M, h, 1.5, 1.5, "F");
  doc.setFont("courier", "normal");
  doc.setTextColor(...INK);
  lines.forEach((l, i) => doc.text(l, M + 3, y + 1 + i * 4.4));
  y += h + 2;
};
const box = (x, by, w, h, title, sub, fill) => {
  doc.setFillColor(...fill);
  doc.setDrawColor(148, 163, 184);
  doc.roundedRect(x, by, w, h, 2, 2, "FD");
  font("bold", 9, NAVY);
  doc.text(title, x + w / 2, by + 7, { align: "center" });
  font("normal", 7.5, MUTED);
  doc.splitTextToSize(sub, w - 4).forEach((l, i) => doc.text(l, x + w / 2, by + 12 + i * 3.6, { align: "center" }));
};
const arrow = (x1, y1, x2, y2, label) => {
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(x1, y1, x2, y2);
  const a = Math.atan2(y2 - y1, x2 - x1);
  doc.setFillColor(...ACCENT);
  doc.triangle(x2, y2, x2 - 3 * Math.cos(a - 0.4), y2 - 3 * Math.sin(a - 0.4), x2 - 3 * Math.cos(a + 0.4), y2 - 3 * Math.sin(a + 0.4), "F");
  doc.setLineWidth(0.2);
  if (label) {
    font("normal", 7, ACCENT);
    doc.text(label, (x1 + x2) / 2, (y1 + y2) / 2 - 1.5, { align: "center" });
  }
};

/* ================================================================== COVER */
doc.setFillColor(...NAVY);
doc.rect(0, 0, W, 297, "F");
doc.setFillColor(...ACCENT);
doc.rect(M, 70, 40, 2, "F");
font("bold", 11, [147, 197, 253]);
doc.text("SETUP & TESTING MANUAL", M, 64);
font("bold", 27, [255, 255, 255]);
doc.text(doc.splitTextToSize("VYRON COST – WhatsApp Notifications Setup & Testing Guide", R - M), M, 86);
font("normal", 12, [203, 213, 225]);
doc.text("VOLORA Cost Intelligence · www.volora.co.za", M, 122);
doc.text("Prepared for Kingdom / Handcrafted Foods", M, 130);
font("normal", 9.5, [148, 163, 184]);
doc.text(
  doc.splitTextToSize(
    "This guide describes the WhatsApp notification feature exactly as it is built in the application today: the settings that exist, the screens and buttons as they are labelled, and what each result means. Illustrations are clearly marked as examples. No credentials, tokens or secrets are included.",
    R - M
  ),
  M,
  150
);
font("normal", 9, [148, 163, 184]);
doc.text(`Version 1.0 · ${new Date().toISOString().slice(0, 10)} · VYRONSOFT (Pty) Ltd`, M, 280);

/* ================================================================== TOC page placeholder */
doc.addPage();
const tocPage = doc.getNumberOfPages();
y = 22;

/* ================================================================== CONTENT */
doc.addPage();
y = 22;

h1("Introduction and purpose");
para(
  "VYRON COST (VOLORA) can send a WhatsApp message to your staff when something happens to a customer order — for example when a new order arrives or an order is dispatched. Messages are sent through Twilio, a messaging provider that is authorised to deliver WhatsApp Business messages."
);
para("This guide explains, step by step:");
bullets([
  "what you need before you start, and what Twilio and Meta (WhatsApp) require;",
  "the four settings an administrator enters, and where they are entered;",
  "how to choose who receives which notifications;",
  "how to send a test message, and how to read the result and the delivery report;",
  "what to do when something does not work, and a checklist before going live.",
]);
callout(
  "What the notifications cover",
  "WhatsApp notifications are sent for customer orders handled in the Order Centre — orders placed by customers in the VOLORA customer ordering portal and moved through the Order Centre (approve, pick, pack, dispatch, cancel). Changing an order's status on the back-office Customer Sales Orders screen does not send WhatsApp notifications. An order is always recorded whether or not a notification reaches anyone.",
  "info"
);
h2("How it works (illustrative diagram)");
need(62);
const dy = y + 2;
box(M, dy, 38, 26, "VOLORA", "Order event in the Order Centre", [239, 246, 255]);
box(M + 50, dy, 38, 26, "Twilio", "Checks sender, template and number", [240, 253, 244]);
box(M + 100, dy, 38, 26, "WhatsApp (Meta)", "Delivers to the phone", [254, 252, 232]);
box(M + 142, dy, 32, 26, "Staff phone", "Message received", [250, 245, 255]);
arrow(M + 38, dy + 10, M + 50, dy + 10, "1 send");
arrow(M + 88, dy + 10, M + 100, dy + 10, "2");
arrow(M + 138, dy + 10, M + 142, dy + 10, "3");
arrow(M + 69, dy + 26, M + 69, dy + 40, "");
arrow(M + 69, dy + 40, M + 19, dy + 40, "");
arrow(M + 19, dy + 40, M + 19, dy + 26, "");
font("normal", 7.5, ACCENT);
doc.text("4  delivery report (Delivered / Failed) back to VOLORA", M + 44, dy + 44, { align: "center" });
font("italic", 7.5, MUTED);
doc.text("Illustration only — a simplified view of the message path.", M, dy + 52);
y = dy + 58;

h1("Requirements before setup");
table(
  ["You need", "Why"],
  [
    ["A VOLORA administrator who can edit the hosting environment settings (Vercel project for www.volora.co.za)", "The four Twilio settings are server settings; they are not entered on a VOLORA screen."],
    ["A Twilio account (trial for testing, upgraded for production)", "Twilio sends the WhatsApp messages and bills per message."],
    ["A Meta (Facebook) Business portfolio for Kingdom / Handcrafted Foods", "Meta must approve the business, the WhatsApp sender and its display name."],
    ["A phone number dedicated to WhatsApp Business sending", "This becomes the sender. It cannot be in use on the ordinary WhatsApp app at the same time."],
    ["An approved WhatsApp message template (Content SID starting with HX)", "WhatsApp only allows business-initiated messages through approved templates (see section 6)."],
    ["A VOLORA user with permission to edit sales orders", "Needed to add notification recipients and send tests (Order Centre › Notifications)."],
    ["The mobile numbers of the staff who must be notified", "Each recipient's WhatsApp number."],
  ],
  [80, 94]
);

h1("Twilio account creation or access");
steps([
  "Go to twilio.com and sign up, or sign in to the account the business already uses. Use a company mailbox that more than one person can access.",
  "Verify your e-mail address and your own mobile number when asked.",
  "A new account starts as a trial. A trial is enough to test with the WhatsApp Sandbox (section 5), but it can only reach numbers you have verified and adds trial restrictions.",
  "Before going live, upgrade the account (Admin › Account billing / Upgrade) and add a payment method. Twilio charges per message; Meta also charges per conversation for template messages.",
  "Enable two-factor authentication on the Twilio login and limit who has administrator access.",
]);

h1("Account SID and Auth Token");
para("VOLORA authenticates to Twilio with two values from the Twilio Console home page (Account Info panel):");
table(
  ["Twilio value", "Looks like", "Goes into VOLORA setting"],
  [
    ["Account SID", "Starts with AC followed by 32 characters", "TWILIO_ACCOUNT_SID"],
    ["Auth Token", "32 characters, hidden until you click Show", "TWILIO_AUTH_TOKEN"],
  ],
  [45, 70, 59]
);
callout(
  "Keep the Auth Token secret",
  "The Auth Token gives full access to the Twilio account, and VOLORA also uses it to verify that delivery reports genuinely come from Twilio. Never e-mail it, paste it into WhatsApp or chat, or store it in a shared document. If it is ever exposed, rotate it in the Twilio Console and update TWILIO_AUTH_TOKEN immediately (section 16).",
  "danger"
);

h1("WhatsApp sender setup");
h2("Option A — testing with the Twilio WhatsApp Sandbox (trial)");
steps([
  "In the Twilio Console open Messaging › Try it out › Send a WhatsApp message. Twilio shows the Sandbox number and a personal join phrase (\"join <two words>\").",
  "From each test phone, send that join phrase to the Sandbox number in WhatsApp. Only phones that have joined can receive Sandbox messages, and the join expires after a period of inactivity.",
  "Use the Sandbox number as TWILIO_WHATSAPP_FROM and leave TWILIO_WHATSAPP_TEMPLATE_SID empty. VOLORA then sends a plain text message, which WhatsApp accepts because the phone messaged the Sandbox recently.",
]);
callout("Sandbox limits", "The Sandbox is for testing only: messages show Twilio's Sandbox sender rather than your business, every recipient must join first, and free-form messages are only accepted within 24 hours of that phone's last message to the Sandbox.", "warn");
h2("Option B — your own WhatsApp Business sender (production)");
steps([
  "In the Twilio Console open Messaging › Senders › WhatsApp senders and start the self sign-up.",
  "Log in with Facebook and connect (or create) the Meta Business portfolio for Kingdom / Handcrafted Foods.",
  "Enter the phone number that will send the messages and verify it with the code Meta sends by SMS or voice call.",
  "Enter the WhatsApp display name (normally the trading name). Meta reviews it against your business name.",
  "Wait until the sender shows as Online / approved in Twilio. The number (for example +27 21 000 0000) is the value for TWILIO_WHATSAPP_FROM.",
]);

h1("WhatsApp Business and Meta approval requirements");
bullets([
  "Business verification: Meta may require the business to be verified in Meta Business Manager (company registration documents and a matching website or utility bill) before the sender can send at volume.",
  "Display name: must clearly relate to the business; Meta can reject a generic or misleading name.",
  "Messaging policy: messages must comply with the WhatsApp Business and Commerce policies. Order notifications to your own staff are a normal utility use.",
  "24-hour window: a business may send a free-form message only within 24 hours of the recipient's last message to the sender. Outside that window, only approved templates are delivered. VOLORA notifications are started by the business, so in production an approved template is required.",
  "Opt-in: each recipient should agree to receive WhatsApp notifications from the business. Record this when you add them in VOLORA.",
]);

h1("Message template creation and approval");
steps([
  "In the Twilio Console open Messaging › Content Template Builder › Create new.",
  "Give it a name such as volora_order_notification, choose the language (English) and the type Text.",
  "Write the body using the seven variables VOLORA fills (section 8) in this order. Example wording (illustrative — you may phrase it your own way):",
]);
mono(
  "{{1}}: order {{2}} for {{3}}\nDelivery: {{4}}\nItems: {{5}} · Total: {{6}}\nView the order: {{7}}"
);
steps([
  "Provide sample values for each variable when Twilio asks (e.g. VOLORA Order, SO-12345678, Customer name, a date, 3, R1 250,00, https://www.volora.co.za/order-centre/...).",
  "Submit the template for WhatsApp approval and choose the category Utility (transactional order updates). Approval usually takes from minutes to a day.",
  "When the status is Approved, copy the Content SID (starts with HX). That value goes into TWILIO_WHATSAPP_TEMPLATE_SID.",
]);
callout(
  "One template for all order events",
  "VOLORA sends the same template for every event (new order, approved, picking, packed, dispatched, cancelled) with the same seven variables. Word the template so it reads correctly for each event, for example \"Order update\".",
  "info"
);

h1("Required template variables");
para("VOLORA fills the template variables as follows (taken from the application code):");
table(
  ["Variable", "Value VOLORA sends", "Example"],
  [
    ["{{1}}", "The label \"VOLORA Order\" (fixed text in this version)", "VOLORA Order"],
    ["{{2}}", "Order number", "SO-12345678"],
    ["{{3}}", "Customer name", "Sunrise Deli"],
    ["{{4}}", "Requested delivery date, written out in full (en-ZA), or \"Not specified\"", "Thursday, 27 November 2026"],
    ["{{5}}", "Number of order lines", "4"],
    ["{{6}}", "Order total in rand", "R1 250,00"],
    ["{{7}}", "Link to the order in the Order Centre", "https://www.volora.co.za/order-centre/…"],
  ],
  [20, 92, 62]
);
para("When no template is configured, VOLORA sends this plain-text message instead (only accepted within the 24-hour window):", { after: 1 });
mono("NEW ORDER — VOLORA Order\nOrder: SO-12345678\nCustomer: Sunrise Deli\nDelivery: Thursday, 27 November 2026\nItems: 4\nTotal: R1 250,00\nView order: https://www.volora.co.za/order-centre/…");
font("italic", 7.5, MUTED);
para("Illustrative values. The first line names the event (NEW ORDER, ORDER APPROVED, ORDER BEING PICKED, ORDER PACKED, ORDER DISPATCHED, ORDER CANCELLED).", { size: 8, color: MUTED });

h1("VYRON COST configuration");
para(
  "The WhatsApp channel is switched on purely by the presence of three server settings. There is no on/off switch, feature flag or settings form for Twilio credentials inside VOLORA — by design, credentials never pass through the browser or the database."
);
para("Once the settings are in place and the application has been redeployed, open Order Centre › Notifications (sidebar: CUSTOMERS › Order Notifications). The WhatsApp card shows the channel state:", { after: 1 });
table(
  ["Card shows", "Meaning"],
  [
    ["Not configured  ·  Missing: TWILIO_…", "One or more of the three required settings is not set. The missing names are listed."],
    ["Operational  ·  Twilio WhatsApp", "The three required settings are present. The detail line says which sender is used."],
    ["\"… using an approved template.\"", "TWILIO_WHATSAPP_TEMPLATE_SID is set: business-initiated messages can be delivered."],
    ["\"No template configured — messages outside the 24-hour window will be refused by WhatsApp.\"", "No template: suitable only for Sandbox testing."],
    ["\"Delivery reports are on.\"", "NEXT_PUBLIC_APP_URL is an https address: Twilio will report Delivered / Failed."],
    ["\"Delivery reports are off (set NEXT_PUBLIC_APP_URL to the public https address).\"", "Messages can be sent, but their final delivery is not reported back."],
    ["Last successful delivery: …  /  No successful delivery yet", "Time of the most recent successful WhatsApp send for your company."],
  ],
  [78, 96]
);
font("italic", 7.5, MUTED);
para("Wording above is quoted from the application.", { size: 8, color: MUTED });

h1("Required environment variables and where to set them");
para("Set these in the hosting platform — Vercel › the VOLORA project › Settings › Environment Variables › Production. Then redeploy the production deployment so the new values are loaded.", { after: 1 });
table(
  ["Variable", "Required", "Value"],
  [
    ["TWILIO_ACCOUNT_SID", "Yes", "Twilio Account SID (AC…)"],
    ["TWILIO_AUTH_TOKEN", "Yes", "Twilio Auth Token (secret). Also used to verify delivery reports."],
    ["TWILIO_WHATSAPP_FROM", "Yes", "The WhatsApp sender number, e.g. +27210000000 or whatsapp:+27210000000 (either form is accepted)."],
    ["TWILIO_WHATSAPP_TEMPLATE_SID", "Production: yes", "Content SID (HX…) of the approved template. Leave empty only for Sandbox testing."],
    ["NEXT_PUBLIC_APP_URL", "For delivery reports", "https://www.volora.co.za — must be the exact public https address Twilio will call."],
  ],
  [55, 30, 89]
);
callout(
  "Only the administrator of the hosting platform enters these",
  "VOLORA staff accounts cannot see or edit these values. Ask your VOLORA administrator (VYRONSOFT) to enter them, or give a nominated person access to the Vercel project. Send the Auth Token through a password manager share — never by e-mail or WhatsApp.",
  "warn"
);
para("Note: TWILIO_FROM_NUMBER is a separate setting for SMS notifications and is not needed for WhatsApp.");

h1("How to configure the notification recipient");
steps([
  "Open Order Centre › Notifications (sidebar CUSTOMERS › Order Notifications).",
  "Under Recipients click Add recipient.",
  "Enter Name and choose a Role. The role decides which events the person hears about (table below).",
  "Enter the Mobile number. South African numbers can be typed as 082 123 4567, 0027 82 123 4567 or +27821234567; VOLORA stores them in international form (+27…).",
  "Tick WhatsApp. (Before the provider is configured this box is disabled and reads \"WhatsApp — no provider yet\".)",
  "Leave Active ticked and click Save recipient. The screen confirms \"<name> saved.\"",
]);
table(
  ["Role", "Hears about"],
  [
    ["Commercial", "New orders, approvals, cancellations"],
    ["Production", "Approved, picking and packed orders"],
    ["Delivery", "Packed and dispatched orders"],
    ["Management", "New orders and cancellations"],
  ],
  [40, 134]
);
para("Recipients belong to your company only. To stop someone receiving messages, untick Active or remove them (their delivery history is kept). If the number cannot be read, VOLORA shows: \"That mobile number could not be read. Use a format like 082 123 4567 or +27821234567.\"");

h1("How to test a WhatsApp notification");
steps([
  "Confirm the WhatsApp card shows Operational (section 9). For Sandbox testing, make sure the test phone has sent the join phrase within the last 24 hours.",
  "In the Recipients list, find a recipient with WhatsApp ticked and a mobile number.",
  "Click the WhatsApp button (with the send icon) next to that recipient. This sends a test only — no order is created.",
  "Read the result banner: \"Test to <name> via whatsapp: Sent\" (accepted by Twilio), \"Failed\" with Twilio's reason, or \"Not Configured\" with the missing settings.",
  "Check the phone. The test message reads: \"VOLORA Order: this is a test notification. No order was created.\" (or, with a template, your template filled with the test values VOLORA Order / TEST / Test notification).",
]);
callout(
  "\"Sent\" is not yet \"Delivered\"",
  "Sent means Twilio accepted the message. Whether WhatsApp delivered it is reported afterwards. For test messages that confirmation is visible in the Twilio Console (Monitor › Logs › Messaging), not in VOLORA: test messages are not linked to an order, and VOLORA's delivery log is shown per order.",
  "info"
);
para("End-to-end check with a real order: when a customer order is approved in the Order Centre, the Production and Commercial recipients should receive the message. Do this with a genuine order, or agree a test order with the business first — the notification follows the real order workflow.");

h1("How to read the delivery report");
para("Open the order in the Order Centre. The Notifications section lists every notification for that order — one row per recipient and channel, with the channel, time, status and any error.", { after: 1 });
table(
  ["Status", "Meaning", "What to do"],
  [
    ["Sent", "Twilio accepted the message.", "Nothing. It moves to Delivered or Failed when Twilio reports back (delivery reports on)."],
    ["Delivered", "WhatsApp delivered (or the recipient read) the message.", "Nothing."],
    ["Failed", "Twilio or WhatsApp refused or could not deliver. The row shows e.g. \"Twilio reported undelivered (error 63016).\"", "Look up the error code (section 14)."],
    ["Not Configured", "A required setting was missing when the event happened.", "Complete section 10 and redeploy."],
  ],
  [26, 76, 72]
);
para("Delivery reports work only when NEXT_PUBLIC_APP_URL is the public https address. VOLORA includes the report address with every message, so nothing has to be configured in the Twilio Console for this. VOLORA accepts a report only if it carries a valid Twilio signature.");

h1("Common errors and troubleshooting");
table(
  ["You see", "Likely cause", "Fix"],
  [
    ["Card: Not configured · Missing: …", "A setting is absent, or the app was not redeployed after adding it.", "Add the listed variables in Vercel (Production) and redeploy."],
    ["Recipient's WhatsApp box is greyed out (\"no provider yet\")", "The WhatsApp provider is not configured yet.", "Complete section 10 first."],
    ["\"Twilio rejected the message: … (code 20003)\"", "Wrong Account SID or Auth Token.", "Re-copy both values from the Twilio Console; redeploy."],
    ["\"… (code 21608)\" or trial wording", "Trial account sending to a number that is not verified / not joined to the Sandbox.", "Verify the number or join the Sandbox; upgrade for production."],
    ["\"… (code 21211)\" / \"That mobile number could not be read…\"", "Invalid recipient number.", "Correct the recipient's mobile (+27…)."],
    ["Error 63007", "The From number is not an active WhatsApp sender on this Twilio account.", "Check TWILIO_WHATSAPP_FROM matches the approved sender exactly."],
    ["Error 63016", "Free-form message outside the 24-hour window.", "Set TWILIO_WHATSAPP_TEMPLATE_SID to an approved template."],
    ["\"Twilio rejected the template message: …\"", "Template not approved, wrong Content SID, or variable mismatch.", "Use the HX… SID of an Approved template that uses {{1}}–{{7}}."],
    ["\"Could not reach Twilio: …\"", "Network problem between the server and Twilio.", "Retry later; check Twilio status page."],
    ["Status stays Sent", "Delivery reports are off, or NEXT_PUBLIC_APP_URL does not match the address in use.", "Set NEXT_PUBLIC_APP_URL=https://www.volora.co.za and redeploy."],
  ],
  [50, 60, 64]
);
para("Twilio publishes the meaning of every numeric error code in its Error and Warning Dictionary (twilio.com/docs/api/errors). Notification problems never block an order: the order is always saved, and a failed notification is retried on the next event for that order.", { size: 9.5 });

h1("Production activation checklist");
table(
  ["#", "Check", "Done"],
  [
    ["1", "Twilio account upgraded from trial; billing contact set", ""],
    ["2", "Meta Business portfolio connected and (if requested) verified", ""],
    ["3", "WhatsApp sender approved and Online in Twilio; display name approved", ""],
    ["4", "Order notification template Approved (category Utility); Content SID (HX…) recorded", ""],
    ["5", "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_WHATSAPP_TEMPLATE_SID set in Vercel Production", ""],
    ["6", "NEXT_PUBLIC_APP_URL = https://www.volora.co.za", ""],
    ["7", "Production redeployed after the changes", ""],
    ["8", "Order Centre › Notifications: WhatsApp card shows Operational, \"using an approved template\" and \"Delivery reports are on\"", ""],
    ["9", "Recipients added with correct roles, mobiles and WhatsApp ticked; consent recorded", ""],
    ["10", "Test sent to each recipient: result Sent, message received, Delivered in Twilio logs", ""],
    ["11", "First real order event shows Delivered in the order's Notifications section", ""],
    ["12", "Owner of the Twilio account and the escalation contact agreed", ""],
  ],
  [10, 146, 18]
);

h1("Security and credential handling");
bullets([
  "Credentials live only in the hosting platform's encrypted environment settings. VOLORA never stores them in its database, never sends them to the browser and never writes them to logs.",
  "Grant access to the Twilio Console and the Vercel project to named people only, each with their own login and two-factor authentication.",
  "Share secrets only through a password manager. Never through e-mail, WhatsApp, chat, documents or screenshots.",
  "Rotate the Twilio Auth Token if it may have been exposed, when a person with access leaves, and at least annually. After rotating, update TWILIO_AUTH_TOKEN and redeploy straight away — delivery reports signed with the old token will be rejected until you do.",
  "Delivery reports are accepted only with a valid Twilio signature, so a third party cannot fake a delivery status.",
  "Notification recipients are company staff. Keep the recipient list current and remove leavers promptly.",
  "Message content includes customer names, order numbers and totals. Only add recipients who are entitled to see that information.",
]);
callout(
  "Testing safely",
  "Sending a test from the Notifications screen sends one real WhatsApp message to that recipient and is charged by Twilio. It never creates an order or changes any data in VOLORA.",
  "info"
);

/* ================================================================== TOC */
doc.setPage(tocPage);
y = 26;
font("bold", 17, NAVY);
doc.text("Contents", M, y);
y += 10;
for (const t of toc) {
  font("normal", 11, INK);
  doc.text(`${t.n}. ${t.title}`, M, y);
  doc.text(String(t.page), R, y, { align: "right" });
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y + 2, R, y + 2);
  y += 8;
}

/* ================================================================== FOOTERS */
const pages = doc.getNumberOfPages();
for (let p = 2; p <= pages; p++) {
  doc.setPage(p);
  doc.setDrawColor(203, 213, 225);
  doc.line(M, 284, R, 284);
  font("normal", 7.5, MUTED);
  doc.text("VYRON COST – WhatsApp Notifications Setup & Testing Guide · VOLORA Cost Intelligence", M, 289);
  doc.text(`Page ${p} of ${pages}`, R, 289, { align: "right" });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(doc.output("arraybuffer")));
console.log(`wrote ${path.relative(ROOT, OUT)} (${pages} pages)`);
