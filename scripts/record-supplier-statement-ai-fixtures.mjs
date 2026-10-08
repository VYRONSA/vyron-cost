#!/usr/bin/env node
/**
 * Records the statement AI's real answers for the SYNTHETIC statements in
 * scripts/support/synthetic-statement-pdfs.mjs (invented suppliers, no real data), so
 * test-supplier-statement-ai.mjs can replay them offline. Calls OpenAI — run deliberately:
 *
 *   VOLORA_STATEMENT_AI_RECORD=1 node scripts/record-supplier-statement-ai-fixtures.mjs
 *
 * Needs OPENAI_API_KEY (environment, or .env.local). Writes scripts/fixtures/supplier-statement-ai/*.json.
 * Never records anything for a real statement, and never touches a database (usage is not recorded).
 */
import { register } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

if (process.env.VOLORA_STATEMENT_AI_RECORD !== "1") {
  console.log("Not recording: set VOLORA_STATEMENT_AI_RECORD=1 to call OpenAI for the synthetic statements.");
  process.exit(0);
}
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
register("./support/session-security-test-hook.mjs", import.meta.url);
if (!process.env.OPENAI_API_KEY && existsSync(path.join(ROOT, ".env.local"))) {
  const m = /^OPENAI_API_KEY=(.*)$/m.exec(readFileSync(path.join(ROOT, ".env.local"), "utf8"));
  if (m) process.env.OPENAI_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
}
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set.");
console.warn = () => {};

const pdfs = await import("./support/synthetic-statement-pdfs.mjs");
const ex = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-supplier-statement-pdf.ts")).href);
const ai = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-supplier-statement-ai.ts")).href);
const OUT = path.join(ROOT, "scripts/fixtures/supplier-statement-ai");
mkdirSync(OUT, { recursive: true });

const layouts = (process.env.VOLORA_STATEMENT_AI_LAYOUTS || "layoutInvoiceAndOurReference,layoutClassic,layoutErp,layoutWholesaler,layoutHeaderless,layoutMonthFirst").split(",");
for (const name of layouts) {
  const extraction = await ex.extractSupplierStatementPdf(pdfs[name](), { ownCompanyNames: [pdfs.OWN_COMPANY] });
  const calls = [];
  const recordingFetch = async (url, init) => {
    const res = await fetch(url, init);
    const json = await res.clone().json();
    const body = JSON.parse(init.body);
    const input = JSON.parse(body.input[0].content[0].text);
    calls.push({ name: body.text.format.name, firstLineIndex: input.rows?.[0]?.lineIndex ?? null, status: res.status, response: json });
    return res;
  };
  const result = await ai.interpretStatementWithAi(extraction, {
    companyId: "synthetic",
    ownCompanyNames: [pdfs.OWN_COMPANY],
    deps: { fetch: recordingFetch, checkAllowance: async () => ({ allowed: true }), recordUsage: async () => null },
  });
  writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ layout: name, model: result.model, recordedAt: new Date().toISOString(), calls }, null, 1) + "\n");
  console.log(`${name}: ${result.aiStatus}, ${calls.length} call(s), types ${JSON.stringify(Object.fromEntries(Object.entries(result.counts).filter(([, v]) => v)))}`);
}
