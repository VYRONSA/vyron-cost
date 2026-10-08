#!/usr/bin/env node
/**
 * VOLORA — supplier statement PDF reader at the PRODUCTION runtime boundary.
 *
 * Regression for production's "DOMMatrix is not defined" (released f1c1bb4): pdfjs-dist creates a
 * DOMMatrix when its module loads; in Node it gets the class from @napi-rs/canvas, which it loads with
 * a runtime require that the production bundle did not ship. Local runs passed because the package
 * was resolvable on the developer machine.
 *
 * Each case runs in a FRESH Node process (DOMMatrix undefined) with
 * scripts/support/production-pdf-boundary-hook.mjs, which makes @napi-rs/canvas unresolvable from
 * pdfjs-dist exactly as in the deployed bundle. Nothing is mocked: no DOMMatrix is defined by the test.
 *   1. Control — importing pdfjs directly (the released code path) fails with the production error,
 *      proving the boundary is reproduced.
 *   2. The real extraction module and the real /api/supplier-reconciliations route read text PDFs,
 *      still refuse scanned and password-protected PDFs, and write nothing.
 *   3. The production build ships @napi-rs/canvas with that route (its file trace) and keeps it
 *      external — requires `npm run build` first.
 *
 *   npm run test:supplier-statement-pdf-runtime
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

function probe(mode) {
  const r = spawnSync(process.execPath, ["--import", "./scripts/support/production-pdf-boundary-hook.mjs", "scripts/support/statement-pdf-runtime-probe.mjs", mode], { cwd: ROOT, encoding: "utf8", timeout: 240000 });
  const line = `${r.stdout}`.split("\n").find((l) => l.startsWith("PROBE "));
  if (!line) return { crashed: `${r.stdout}\n${r.stderr}`.slice(-1500) };
  return JSON.parse(line.slice(6));
}

section("1. Control: the production boundary is reproduced");
{
  const c = probe("control");
  check("fresh process starts without DOMMatrix (as on the server)", c.domMatrixAtStart === "undefined", JSON.stringify(c));
  check("importing pdfjs directly there fails with the production error", /ReferenceError: DOMMatrix is not defined/.test(c.controlError || ""), c.controlError || c.crashed);
}

section("2. The real reader and route at that boundary");
{
  const a = probe("app");
  if (a.crashed) check("probe ran", false, a.crashed);
  else {
    check("fresh process starts without DOMMatrix", a.domMatrixAtStart === "undefined");
    check("a text PDF is read (2 pages, 6 lines, balances agree)", a.classic.ok && a.classic.transactions === 6 && a.classic.agrees === true, JSON.stringify(a.classic));
    check("a second layout is read", a.erp.ok && a.erp.transactions === 5, JSON.stringify(a.erp));
    check("a scanned PDF is still refused (no OCR)", !a.scanned.ok && /no usable text layer/.test(a.scanned.error), JSON.stringify(a.scanned));
    check("a password-protected PDF is still refused", !a.locked.ok && /password/i.test(a.locked.error), JSON.stringify(a.locked));
    check("POST /api/supplier-reconciliations (extract) → 200, statement returned for review", a.route.status === 200 && a.route.mode === "review" && a.route.transactions === 6, JSON.stringify(a.route));
    check("…with no DOMMatrix error and no database write", !/DOMMatrix/.test(a.route.error || "") && a.route.writes === 0);
    check("the real classes from @napi-rs/canvas are now installed", a.domMatrixAtEnd === "function");
  }
}

section("3. The production build ships the PDF reader's native helper");
{
  const trace = path.join(ROOT, ".next/server/app/api/supplier-reconciliations/route.js.nft.json");
  if (!existsSync(trace)) check("production build present (run `npm run build` first)", false, trace);
  else {
    const files = JSON.parse(readFileSync(trace, "utf8")).files;
    check("route trace includes @napi-rs/canvas", files.some((f) => /node_modules\/@napi-rs\/canvas\/(index|js-binding)\.js$/.test(f)), "not traced");
    check("route trace includes its native binary for this platform", files.some((f) => /node_modules\/@napi-rs\/canvas-[a-z0-9-]+\/.*\.node$/.test(f)));
    const chunks = files.filter((f) => /\/chunks\/.*\.js$/.test(f)).map((f) => path.join(path.dirname(trace), f));
    check("@napi-rs/canvas is external (not compiled into a server chunk)", chunks.length > 0 && !chunks.some((c) => existsSync(c) && /napi-rs\/canvas\/js-binding|loadBinding\(/.test(readFileSync(c, "utf8"))));
    // pdfjs's parser ("worker") must be in the route's build output, not left to a runtime import of
    // ./pdf.worker.mjs beside the bundled chunk (where it does not exist).
    check(
      "the pdfjs worker (WorkerMessageHandler registration) is part of the route's build output",
      files.some((f) => /pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs$/.test(f)) || chunks.some((c) => existsSync(c) && /pdfjsWorker\s*=\s*\{/.test(readFileSync(c, "utf8")))
    );
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
