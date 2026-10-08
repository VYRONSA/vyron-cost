/**
 * Child-process probe for test-supplier-statement-pdf-bundle.mjs: runs the supplier statement PDF
 * reader FROM THE BUILT NEXT PRODUCTION BUNDLE (.next/server), in a fresh Node process.
 *
 * It loads the route's own Turbopack runtime and the chunks listed in the generated route entry
 * (.next/server/app/api/supplier-reconciliations/route.js), finds the bundled module that defines
 * the statement reader (by a message only that module contains), and calls its
 * extractSupplierStatementPdf — the compiled code the deployed route runs, with pdfjs compiled into a
 * server chunk exactly as deployed. No server, session or database is involved.
 *
 *   node statement-pdf-bundle-probe.cjs <name>=<pdf path> ...      → prints one "BUNDLE {json}" line
 */
/* eslint-disable @typescript-eslint/no-require-imports -- the generated Turbopack server runtime is CommonJS and is loaded with require, as Next loads it. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const NEXT = path.join(ROOT, ".next");
const ROUTE = "server/app/api/supplier-reconciliations/route.js";
const MARKER = "The PDF reader cannot start on this server";

const errors = [];
const origError = console.error;
console.error = (...args) => errors.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(" "));
console.warn = () => {};
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://qa.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "qa-bundle-probe";

(async () => {
  const out = { domMatrixAtStart: typeof globalThis.DOMMatrix, route: ROUTE, results: {} };
  const entry = fs.readFileSync(path.join(NEXT, ROUTE), "utf8");
  const R = require(path.join(NEXT, "server/chunks/[turbopack]_runtime.js"))(ROUTE);
  const chunks = [...entry.matchAll(/R\.c\("([^"]+)"\)/g)].map((m) => m[1]);
  for (const c of chunks) R.c(c);
  out.chunks = chunks.length;

  // The bundled module that defines the reader: the module whose factory contains MARKER.
  let moduleId = null;
  for (const c of chunks) {
    const text = fs.readFileSync(path.join(NEXT, c), "utf8");
    const at = text.indexOf(MARKER);
    if (at < 0) continue;
    const ids = [...text.slice(0, at).matchAll(/(?:^|[,\[{])\s*(\d{3,8})\s*,\s*(?:\(?[A-Za-z_$,\s]*\)?\s*=>|function)/g)];
    if (ids.length) moduleId = Number(ids[ids.length - 1][1]);
    out.readerChunk = c;
    break;
  }
  out.moduleId = moduleId;
  if (moduleId === null) {
    out.fatal = "The bundled statement reader was not found in the route's chunks.";
    return finish(out);
  }
  const mod = R.m(moduleId);
  const api = mod.exports && typeof mod.exports.then === "function" ? await mod.exports : mod.exports;
  if (!api || typeof api.extractSupplierStatementPdf !== "function") {
    out.fatal = `Bundled module ${moduleId} does not export extractSupplierStatementPdf.`;
    return finish(out);
  }

  for (const arg of process.argv.slice(2)) {
    const [name, file] = arg.split(/=(.*)/s);
    const before = errors.length;
    try {
      const r = await api.extractSupplierStatementPdf(new Uint8Array(fs.readFileSync(file)), { ownCompanyNames: ["Handcrafted Food Products (Pty) Ltd"] });
      out.results[name] = { ok: true, pages: r.pageCount, transactions: r.transactions.length, toReconcile: r.counts.toReconcile, layout: r.layout, supplier: r.supplier.value, opening: r.openingBalance.value, closing: r.closingBalance.value, agrees: r.balanceCheck.agrees };
    } catch (error) {
      out.results[name] = { ok: false, error: `${error && error.name}: ${error && error.message}`, cause: error && error.cause ? String(error.cause.message || error.cause) : null };
    }
    out.results[name].logged = errors.slice(before);
  }
  out.domMatrixAtEnd = typeof globalThis.DOMMatrix;
  out.pdfjsWorkerAtEnd = Boolean(globalThis.pdfjsWorker && globalThis.pdfjsWorker.WorkerMessageHandler);
  finish(out);
})().catch((error) => finish({ fatal: `${error && error.name}: ${error && error.message}` }));

function finish(out) {
  console.error = origError;
  process.stdout.write("BUNDLE " + JSON.stringify(out) + "\n");
}
