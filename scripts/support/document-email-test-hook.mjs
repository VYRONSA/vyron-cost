/**
 * VYRON — module substitution hook for the document email route tests.
 *
 * The routes under test are imported unmodified. Three server-boundary modules
 * are swapped for in-process doubles so the routes can run with no cookies, no
 * database and no credentials:
 *
 *   @/lib/supabase-server              -> an in-memory Supabase stand-in
 *   @/lib/vyron-workspace-admin-server -> the verified workspace session
 *   @/lib/vyron-workspace-server       -> the verified workspace company
 *
 * Everything else — permission checks, company resolution, ownership, PDF
 * rendering, the email transport — is the shipped code.
 *
 * It also resolves `@/` and extensionless relative imports under src/ to real
 * FILES. The route graph reaches directory modules (`@/lib/platform/entitlement`
 * -> index.ts), which ts-alias-hook would hand to Node as a directory; that hook
 * is shared by other suites and is left as it is.
 *
 * Chain after scripts/support/ts-alias-hook.mjs:
 *
 *   register("./support/ts-alias-hook.mjs", import.meta.url);
 *   register("./support/document-email-test-hook.mjs", import.meta.url);
 *
 * Family A under the Repository Safety Programme: pure resolution, no network,
 * no database, no writes.
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
  "@/lib/supabase-server": "./document-email-test-stubs/supabase-server.mjs",
  "@/lib/vyron-workspace-admin-server": "./document-email-test-stubs/workspace-admin-server.mjs",
  "@/lib/vyron-workspace-server": "./document-email-test-stubs/workspace-server.mjs",
};

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveFile(base) {
  for (const suffix of SUFFIXES) {
    if (isFile(`${base}${suffix}`)) return `${base}${suffix}`;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  const stub = STUBS[specifier];
  if (stub) return { url: new URL(stub, import.meta.url).href, shortCircuit: true };

  // The `next` package has no exports map, so Node's ESM resolver needs the
  // file name that the Next.js bundler resolves on its own.
  if (specifier === "next/server") return next("next/server.js", context);

  // jspdf's Node build is CommonJS marked __esModule with `default` = jsPDF.
  // The bundler honours that marker; native Node hands back the whole exports
  // object as the default. Reproduce the bundler's interop for src/ imports.
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

/**
 * Two bundler behaviours Node does not share, reproduced for src/ only:
 *
 *  - JSON is imported without an attribute; Node requires `type: "json"`.
 *  - Types are imported in ordinary import statements (`import { SomeType }`).
 *    The bundler drops them; Node's type stripping cannot know a name is a
 *    type and fails at link time. So src/ TypeScript is compiled here with the
 *    project's own `typescript` (transpileModule elides type-only imports), the
 *    same per-file transform the bundler applies. The source is not modified.
 */
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
