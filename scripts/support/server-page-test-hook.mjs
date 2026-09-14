/**
 * VYRON — extra module resolution for the server-page security test.
 *
 * Server pages import the client components they render, and those import
 * `next/link` / `next/navigation` by bare name. Under Node's ESM resolver the
 * `next` package needs the file extension for these entry points, so they are
 * mapped to `next/link.js` / `next/navigation.js` — the real modules, not
 * stubs. Registered in addition to session-security-test-hook.mjs.
 */
const NEXT_ENTRY_POINTS = new Set(["next/link", "next/navigation", "next/image", "next/dynamic"]);

export async function resolve(specifier, context, next) {
  if (NEXT_ENTRY_POINTS.has(specifier)) return next(`${specifier}.js`, context);
  return next(specifier, context);
}
