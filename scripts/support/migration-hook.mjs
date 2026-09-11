/**
 * VYRON — module resolution for data-migration scripts.
 *
 * Lets a plain Node script import the shipped TypeScript migration modules
 * unmodified:
 *
 *  - `@/` and extensionless relative imports under src/ resolve to real FILES
 *    (directories via index.ts).
 *  - src/ TypeScript is compiled with the project's own `typescript`
 *    (transpileModule), which also drops type-only imports the way the Next.js
 *    bundler does.
 *  - `xlsx` is CommonJS whose exports Node cannot see statically; it is
 *    re-exported with every named export the bundler would provide.
 *
 * Family A under the Repository Safety Programme: pure resolution and
 * compilation. No network, no database, no writes.
 */
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

const SRC = path.resolve(fileURLToPath(new URL("../../src/", import.meta.url)));
const SRC_URL = pathToFileURL(SRC).href;
const SUFFIXES = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx", "/index.js"];
const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url).href;
const CJS_SHIMS = new Set(["xlsx"]);

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveFile(base) {
  for (const suffix of SUFFIXES) if (isFile(`${base}${suffix}`)) return `${base}${suffix}`;
  return null;
}

export async function resolve(specifier, context, next) {
  if (CJS_SHIMS.has(specifier)) return { url: `vyron-migration-cjs:${specifier}`, shortCircuit: true };
  // `next` has no exports map; Node needs the file the bundler finds on its own.
  if (/^next\/[\w-]+$/.test(specifier)) return next(`${specifier}.js`, context);
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
  if (url.startsWith("vyron-migration-cjs:")) {
    const name = url.slice("vyron-migration-cjs:".length);
    const keys = Object.keys(createRequire(PACKAGE_JSON_URL)(name)).filter((key) => /^[A-Za-z_$][\w$]*$/.test(key) && key !== "default");
    const source = [
      `import { createRequire } from "node:module";`,
      `const m = createRequire(${JSON.stringify(PACKAGE_JSON_URL)})(${JSON.stringify(name)});`,
      `export default m;`,
      ...keys.map((key) => `export const ${key} = m[${JSON.stringify(key)}];`),
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
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, isolatedModules: true },
    });
    return { format: "module", source: output.outputText, shortCircuit: true };
  }
  return next(url, context);
}
