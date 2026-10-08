/**
 * pdfjs-dist ships its worker module without type declarations.
 *
 * The supplier statement reader imports it only for its side effect — registering
 * globalThis.pdfjsWorker so pdfjs parses on the server's main thread — so only the one
 * export pdfjs reads is declared.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
