declare module "pdf-parse" {
  interface PdfParseOptions {
    max?: number;
  }

  interface PdfParseResult {
    text: string;
  }

  function pdfParse(
    data: Buffer | Uint8Array,
    options?: PdfParseOptions,
  ): Promise<PdfParseResult>;

  export default pdfParse;
}
