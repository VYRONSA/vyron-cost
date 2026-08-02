/**
 * pdfjs-dist ships its standalone image decoders without type declarations.
 *
 * Only the JPEG decoder is used, and only the three members the crop path needs
 * are declared — a wider guess at the shape would be a fiction the compiler
 * would then enforce.
 */
declare module "pdfjs-dist/image_decoders/pdf.image_decoders.mjs" {
  export class JpegImage {
    width: number;
    height: number;
    numComponents: number;
    parse(data: Uint8Array): void;
    getData(options: { width: number; height: number; forceRGB?: boolean }): Uint8Array;
  }
}
