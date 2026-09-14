/**
 * VYRON — module substitution hook for the workspace session security test.
 *
 * The session, access and workspace modules and the routes are imported
 * UNMODIFIED — they are what is under test. Only the process boundary is
 * replaced:
 *
 *   next/headers                -> cookies() returns whatever the test says the
 *                                  browser sent, exactly as a request would
 *   @/lib/supabase-server       -> an in-memory Supabase stand-in
 *   @/lib/vyron-workspace-login -> password checking against synthetic
 *                                  fixtures (no Supabase Auth network call)
 *
 * It also compiles src/ TypeScript with the project's own `typescript`, the
 * same per-file transform the bundler applies, and resolves `@/` imports.
 *
 * Family A: no network, no database, no credentials, no writes.
 */
import { readFileSync, statSync } from "node:fs";
import ts from "typescript";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC = path.resolve(fileURLToPath(new URL("../../src/", import.meta.url)));
const SRC_URL = pathToFileURL(SRC).href;
const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url).href;
const JSPDF_INTEROP_URL = "vyron-test-interop:jspdf";
const SUFFIXES = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx", "/index.js"];

const STUBS = {
  "next/headers": "./session-security-test-stubs/next-headers.mjs",
  "@/lib/supabase-server": "./session-security-test-stubs/supabase-server.mjs",
  "@/lib/vyron-workspace-login": "./session-security-test-stubs/workspace-login.mjs",
  // Opt-in: null unless the test supplies a stand-in (see the stub).
  "@/lib/supabase": "./session-security-test-stubs/supabase-browser.mjs",
};

function resolveFile(base) {
  for (const suffix of SUFFIXES) {
    try {
      if (statSync(`${base}${suffix}`).isFile()) return `${base}${suffix}`;
    } catch {
      // next suffix
    }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  const stub = STUBS[specifier];
  if (stub) return { url: new URL(stub, import.meta.url).href, shortCircuit: true };
  if (specifier === "next/server") return next("next/server.js", context);
  if (specifier === "next/cache") return next("next/cache.js", context);
  if (specifier === "jspdf" && context.parentURL?.startsWith(SRC_URL)) {
    return { url: JSPDF_INTEROP_URL, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const file = resolveFile(path.join(SRC, specifier.slice(2)));
    if (file) return next(pathToFileURL(file).href, context);
  }
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  if (relative && context.parentURL?.startsWith(SRC_URL) && !path.extname(specifier)) {
    const file = resolveFile(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (file) return next(pathToFileURL(file).href, context);
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url === JSPDF_INTEROP_URL) {
    const source = [
      `import { createRequire } from "node:module";`,
      `const require = createRequire(${JSON.stringify(PACKAGE_JSON_URL)});`,
      `const m = require("jspdf");`,
      `export default m.__esModule ? m.default : m;`,
      `export const jsPDF = m.jsPDF;`,
      `export const GState = m.GState;`,
    ].join("\n");
    return { format: "module", source, shortCircuit: true };
  }
  if (url.endsWith(".json") && context.importAttributes?.type !== "json") {
    return next(url, { ...context, importAttributes: { ...context.importAttributes, type: "json" } });
  }
  if (url.startsWith(SRC_URL) && /\.(ts|tsx)$/.test(url)) {
    const filePath = fileURLToPath(url);
    const output = ts.transpileModule(readFileSync(filePath, "utf8"), {
      fileName: filePath,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        isolatedModules: true,
        esModuleInterop: true,
      },
    });
    return { format: "module", source: output.outputText, shortCircuit: true };
  }
  return next(url, context);
}
