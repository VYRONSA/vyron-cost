/**
 * VYRON — module resolution hook for `@/` path aliases.
 *
 * WHY THIS EXISTS
 * ---------------
 * The verification scripts import the SHIPPED TypeScript modules directly, so
 * they exercise production logic rather than a copy of it. Node 24 strips the
 * types natively, but it has no knowledge of the `@/*` -> `src/*` alias that
 * tsconfig defines, so any module under test that imports a sibling by alias
 * fails to resolve.
 *
 * Rewriting the production import to a relative path to suit a test would be
 * the wrong way round. This hook teaches the test runner the alias instead, and
 * leaves the application untouched.
 *
 * Family A under the Repository Safety Programme: pure resolution, no I/O
 * beyond `existsSync`, no network, no database, no writes.
 *
 * Usage — register before the dynamic import of the module under test:
 *
 *   import { register } from "node:module";
 *   register("./support/ts-alias-hook.mjs", import.meta.url);
 *   const mod = await import("../src/lib/some-module.ts");
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC = path.resolve(fileURLToPath(new URL("../../src/", import.meta.url)));

/** tsconfig `moduleResolution: bundler` allows extensionless imports; Node does not. */
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, next) {
  if (!specifier.startsWith("@/")) return next(specifier, context);

  const base = path.join(SRC, specifier.slice(2));
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (existsSync(candidate)) {
      return next(pathToFileURL(candidate).href, context);
    }
  }

  // Fail loudly. A silent fallthrough here would surface as a confusing
  // "cannot find module @/..." from deep inside the module under test.
  throw new Error(
    `ts-alias-hook: could not resolve "${specifier}" under ${SRC}. Tried: ${CANDIDATE_SUFFIXES.map((s) => `${base}${s}`).join(", ")}`
  );
}
