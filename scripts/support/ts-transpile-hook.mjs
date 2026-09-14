/**
 * VYRON — load shipped src/ TypeScript from an operational script.
 *
 * Node strips types but cannot tell that `import { SomeType }` names a type,
 * and it knows nothing of the `@/*` alias. This resolves `@/` and extensionless
 * relative imports under src/ to real files and compiles src/ TypeScript with
 * the project's own `typescript` (transpileModule elides type-only imports),
 * the same per-file transform the bundler applies. Nothing is substituted: the
 * script runs the application's code as shipped.
 *
 *   import { register } from "node:module";
 *   register("./support/ts-transpile-hook.mjs", import.meta.url);
 */
import { readFileSync, statSync } from "node:fs";
import ts from "typescript";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC = path.resolve(fileURLToPath(new URL("../../src/", import.meta.url)));
const SRC_URL = pathToFileURL(SRC).href;
const SUFFIXES = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx", "/index.js"];

function resolveFile(base) {
  for (const suffix of SUFFIXES) {
    try {
      if (statSync(`${base}${suffix}`).isFile()) return `${base}${suffix}`;
    } catch {
      // try the next suffix
    }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier === "next/server") return next("next/server.js", context);
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
