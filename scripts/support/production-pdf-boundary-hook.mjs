/**
 * Reproduces the deployed function's module boundary for PDF reading: in the Vercel bundle pdfjs-dist
 * is compiled into a server chunk and its optional native helper @napi-rs/canvas is not shipped next
 * to it, so pdfjs's own runtime `require("@napi-rs/canvas")` fails and it cannot polyfill DOMMatrix.
 * This hook makes exactly that resolution fail — for requests made BY pdfjs-dist only. Nothing is
 * mocked: DOMMatrix stays undefined unless the application loads the real implementation itself.
 * Loaded with `node --import ./scripts/support/production-pdf-boundary-hook.mjs`.
 */
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^@napi-rs\/canvas(\/|$)/.test(specifier) && /pdfjs-dist/.test(String(context.parentURL || ""))) {
      const error = new Error(`Cannot find module '${specifier}' (not shipped with the pdfjs-dist chunk, as in the deployed bundle)`);
      error.code = "MODULE_NOT_FOUND";
      throw error;
    }
    return nextResolve(specifier, context);
  },
});
