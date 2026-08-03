#!/usr/bin/env node
/**
 * VYRON — AI provider availability regression test.
 *
 * PRODUCTION INCIDENT THIS LOCKS DOWN
 * -----------------------------------
 * The OpenAI account ran out of credit. The provider returned:
 *
 *   HTTP 429  credit_balance_exhausted
 *   "You have no credits remaining."
 *
 * The extraction engine wrapped that in a plain Error, the extract route's
 * catch-all mapped it to HTTP 500, and the operator was shown "Internal Server
 * Error" for a billing condition — a message that tells them to report a bug
 * about something only a top-up can fix.
 *
 * WHY IT CANNOT RECUR
 * -------------------
 * Every provider failure is now classified at the transport boundary into a
 * typed `AiServiceUnavailableError`, and the route maps that type — not a parsed
 * message string — to HTTP 503 with plain-language text. This test asserts the
 * classification for every status and body shape the provider is known to
 * return, including the exact payload captured during the incident. A change
 * that lets a 429 fall through to a generic Error fails here.
 *
 * Family A: pure computation, no network, no database, no API key.
 *
 *   npm run test:ai-availability
 */

import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./support/ts-alias-hook.mjs", import.meta.url);

const { classifyAiProviderFailure, isAiServiceUnavailable } = await import("../src/lib/vyron-ai-service-errors.ts");

let failures = 0;
let checks = 0;

function check(name, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
}

console.log("\n  VYRON — AI provider availability classification\n");

// ---------------------------------------------------------------------------
console.log("  1. The exact payload captured during the production incident");

/*
 * Verbatim from the live probe on 2026-08-02. If the classifier ever stops
 * recognising this body, the incident is reproducible again.
 */
const INCIDENT_BODY = {
  error: {
    message:
      "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
    type: "insufficient_quota",
    param: null,
    code: "credit_balance_exhausted",
  },
};

const incident = classifyAiProviderFailure({ status: 429, body: INCIDENT_BODY });
check("classified as unavailable", isAiServiceUnavailable(incident));
check("reason is quota-exhausted", incident?.reason === "quota-exhausted", `got ${incident?.reason}`);
check("provider status retained", incident?.providerStatus === 429);
check(
  "operator message contains no provider prose or stack",
  Boolean(incident?.operatorMessage) &&
    !incident.operatorMessage.toLowerCase().includes("http") &&
    !incident.operatorMessage.toLowerCase().includes("internal server error"),
  incident?.operatorMessage
);
check(
  "operator message explains the document is not lost",
  /saved|manually/i.test(incident?.operatorMessage || ""),
  incident?.operatorMessage
);

// ---------------------------------------------------------------------------
console.log("\n  2. Quota vs rate limit are distinguished");

const rateLimited = classifyAiProviderFailure({
  status: 429,
  body: { error: { message: "Rate limit reached for gpt-4o", type: "rate_limit_error", code: "rate_limit_exceeded" } },
});
check("plain 429 is rate-limited, not quota", rateLimited?.reason === "rate-limited", `got ${rateLimited?.reason}`);
check(
  "rate-limit message invites a retry",
  /try again/i.test(rateLimited?.operatorMessage || ""),
  rateLimited?.operatorMessage
);
check(
  "quota message does NOT invite a pointless retry",
  !/try again/i.test(incident?.operatorMessage || ""),
  incident?.operatorMessage
);

// ---------------------------------------------------------------------------
console.log("\n  3. Every status the provider is known to return");

const cases = [
  [402, { error: { message: "Payment required" } }, "quota-exhausted"],
  [429, INCIDENT_BODY, "quota-exhausted"],
  [429, { error: { message: "Rate limit reached", code: "rate_limit_exceeded" } }, "rate-limited"],
  [500, { error: { message: "The server had an error" } }, "provider-error"],
  [502, {}, "provider-error"],
  [503, {}, "provider-error"],
  [400, { error: { message: "You exceeded your current quota", type: "insufficient_quota" } }, "quota-exhausted"],
];
for (const [status, body, expected] of cases) {
  const result = classifyAiProviderFailure({ status, body });
  check(`HTTP ${status} -> ${expected}`, result?.reason === expected, `got ${result?.reason ?? "null"}`);
}

// ---------------------------------------------------------------------------
console.log("\n  4. Genuine application errors are NOT swallowed as availability");

/*
 * The classifier must not become a catch-all. A malformed request is our bug
 * and has to keep surfacing as one, or a real defect would be reported to the
 * operator as "the AI service is temporarily unavailable" and never fixed.
 */
const notAvailability = [
  [400, { error: { message: "Invalid schema for response_format", code: "invalid_request_error" } }],
  [401, { error: { message: "Incorrect API key provided", code: "invalid_api_key" } }],
  [404, { error: { message: "The model gpt-9 does not exist", code: "model_not_found" } }],
];
for (const [status, body] of notAvailability) {
  const result = classifyAiProviderFailure({ status, body });
  check(`HTTP ${status} is not treated as unavailability`, result === null, `got ${result?.reason}`);
}

// ---------------------------------------------------------------------------
console.log("\n  5. The route contract: unavailability must never map to 5xx-ours");

/*
 * Asserted against the route source rather than a live request, so the test
 * needs no server, no session and no API key — and still fails if someone
 * removes the branch.
 */
const routeSource = readRoute();
check(
  "extract route imports the availability guard",
  routeSource.includes("isAiServiceUnavailable"),
  "the route no longer classifies provider availability"
);
check(
  "extract route responds 503 for unavailability",
  /isAiServiceUnavailable\(error\)[\s\S]{0,900}status:\s*503/.test(routeSource),
  "no 503 response found in the unavailability branch"
);
check(
  "unavailability branch precedes the generic 500 handler",
  routeSource.indexOf("isAiServiceUnavailable(error)") <
    routeSource.indexOf("documentTenantAccessErrorResponse(error, \"Extraction failed.\")"),
  "the generic handler would catch provider errors first"
);

function readRoute() {
  return readFileSync("src/app/api/documents/[id]/extract/route.ts", "utf8");
}

console.log(`\n  ${checks - failures}/${checks} checks passed\n`);
process.exit(failures ? 1 : 0);
