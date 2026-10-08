#!/usr/bin/env node
/**
 * VOLORA — supplier statement PDF reader IN THE BUILT NEXT PRODUCTION BUNDLE.
 *
 * Source-level tests run pdfjs from node_modules, where everything it loads at runtime sits next to
 * it. The deployed route runs pdfjs compiled into a .next/server chunk, where it is not — that is how
 * production failed twice ("DOMMatrix is not defined", then "Setting up fake worker failed: Cannot
 * find module '…/.next/server/chunks/pdf.worker.mjs'") while every source test passed.
 *
 * This test runs the reader from the generated bundle itself (scripts/support/statement-pdf-bundle-
 * probe.cjs: the route's Turbopack runtime, its chunks, the bundled extractSupplierStatementPdf), in a
 * fresh Node process, and checks the route's build trace. Requires `npm run build` first; a build
 * older than the reader source is refused rather than tested.
 *
 * The real Gourmet Foods statement is used only when VOLORA_REAL_STATEMENT_PDF names it; it is never
 * copied into the repository. Without it the test says so and checks synthetic statements only.
 *
 *   npm run build && npm run test:supplier-statement-pdf-bundle
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { jsPDF } from "jspdf";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  } else console.log(`  ok   ${name}`);
};
const section = (t) => console.log(`\n${t}`);

section("1. The built production bundle");
const entry = path.join(ROOT, ".next/server/app/api/supplier-reconciliations/route.js");
const buildId = path.join(ROOT, ".next/BUILD_ID");
if (!existsSync(entry) || !existsSync(buildId)) {
  check("a production build is present (run `npm run build` first)", false, entry);
  finish();
}
const sources = ["src/lib/vyron-supplier-statement-pdf.ts", "src/lib/vyron-supplier-reconciliation.ts", "src/app/api/supplier-reconciliations/route.ts", "next.config.ts", "package-lock.json"];
const newestSource = Math.max(...sources.map((f) => statSync(path.join(ROOT, f)).mtimeMs));
check("the build is newer than the reader source (not a stale bundle)", statSync(buildId).mtimeMs >= newestSource, `BUILD_ID ${new Date(statSync(buildId).mtimeMs).toISOString()} < source ${new Date(newestSource).toISOString()}`);

// Statements to read: synthetic layouts (and failure cases) written to a temp folder for the probe.
const pdfs = await import("./support/synthetic-statement-pdfs.mjs");
const dir = mkdtempSync(path.join(tmpdir(), "volora-bundle-pdf-"));
const write = (name, bytes) => {
  const file = path.join(dir, `${name}.pdf`);
  writeFileSync(file, bytes);
  return `${name}=${file}`;
};
const locked = new jsPDF({ unit: "pt", encryption: { userPassword: "secret", ownerPassword: "owner", userPermissions: ["print"] } });
locked.text("Coastal Fresh Produce (Pty) Ltd", 40, 40);
const args = [
  write("classic", pdfs.layoutClassic()),
  write("erp", pdfs.layoutErp()),
  write("headerless", pdfs.layoutHeaderless()),
  write("scanned", pdfs.layoutScanned()),
  write("locked", new Uint8Array(locked.output("arraybuffer"))),
  // A file with a PDF header and no PDF structure: pdfjs cannot open it.
  write("corrupt", new TextEncoder().encode("%PDF-1.4\n% not a real PDF body\n1 0 obj <<>> garbage\n%%EOF\n")),
];
const real = process.env.VOLORA_REAL_STATEMENT_PDF;
if (real && existsSync(real)) args.push(`real=${real}`);

const run = spawnSync(process.execPath, ["scripts/support/statement-pdf-bundle-probe.cjs", ...args], { cwd: ROOT, encoding: "utf8", timeout: 300000 });
const line = `${run.stdout}`.split("\n").find((l) => l.startsWith("BUNDLE "));
const out = line ? JSON.parse(line.slice(7)) : { fatal: `${run.stdout}\n${run.stderr}`.slice(-1500) };
check("the bundled reader was found in the route's own chunks and loaded", !out.fatal && Number.isInteger(out.moduleId), out.fatal || "");
if (out.fatal) finish();
check("fresh process: no DOMMatrix before the reader runs (as on the server)", out.domMatrixAtStart === "undefined");
const r = out.results;

section("2. Statements read through the bundle");
check("synthetic statement A (2 pages, column layout) is read: 6 lines, balances agree", r.classic.ok && r.classic.transactions === 6 && r.classic.agrees === true, JSON.stringify(r.classic));
check("synthetic statement B (signed amounts, ISO dates) is read: 5 lines", r.erp.ok && r.erp.transactions === 5, JSON.stringify(r.erp));
check("synthetic statement D (no column headings) is read: 3 lines", r.headerless.ok && r.headerless.transactions === 3, JSON.stringify(r.headerless));
check("every statement opened: no 'fake worker' / missing pdf.worker.mjs failure", [r.classic, r.erp, r.headerless].every((x) => x.ok && !/fake worker|pdf\.worker/i.test(`${x.error || ""} ${x.cause || ""} ${(x.logged || []).join(" ")}`)));
check("pdfjs used its explicitly loaded worker (globalThis.pdfjsWorker registered)", out.pdfjsWorkerAtEnd === true);

section("3. Refusals and failure reporting are unchanged in the bundle");
check("a scanned PDF is still refused (no OCR)", !r.scanned.ok && /no usable text layer/.test(r.scanned.error), JSON.stringify(r.scanned));
check("a password-protected PDF is still refused", !r.locked.ok && /password/i.test(r.locked.error), JSON.stringify(r.locked));
check("an unreadable PDF keeps the safe user message", !r.corrupt.ok && /The PDF could not be read\./.test(r.corrupt.error), JSON.stringify(r.corrupt));
check("…and the underlying pdfjs exception is logged server-side", (r.corrupt.logged || []).some((l) => /statement PDF/i.test(l) && /Invalid PDF|InvalidPDF|PDF structure|pdf/i.test(l)), JSON.stringify(r.corrupt.logged));
check("…and kept as the error's cause", Boolean(r.corrupt.cause), JSON.stringify(r.corrupt));

section("4. The real supplier statement (when available locally)");
if (r.real) {
  check(`the real statement is read through the bundle (${r.real.pages} pages, ${r.real.transactions} lines)`, r.real.ok && r.real.transactions > 0, JSON.stringify(r.real));
} else console.log(`  --   NOT RUN: VOLORA_REAL_STATEMENT_PDF is ${real ? `set but missing (${real})` : "not set"}; only synthetic statements were checked.`);

section("5. The route's build output ships what pdfjs needs at runtime");
{
  const trace = JSON.parse(readFileSync(`${entry}.nft.json`, "utf8")).files;
  const traced = trace.map((f) => path.join(path.dirname(entry), f));
  check("@napi-rs/canvas and its native binary are traced into the route", trace.some((f) => /@napi-rs\/canvas\/js-binding\.js$/.test(f)) && trace.some((f) => /@napi-rs\/canvas-[a-z0-9-]+\/.*\.node$/.test(f)));
  const workerShipped =
    trace.some((f) => /pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs$/.test(f)) ||
    traced.filter((f) => /\/chunks\/.*\.js$/.test(f.replace(/\\/g, "/")) && existsSync(f)).some((f) => /pdfjsWorker\s*=\s*\{/.test(readFileSync(f, "utf8")));
  check("the pdfjs worker (WorkerMessageHandler registration) is part of the route's build output", workerShipped);
}
finish();

function finish() {
  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}
